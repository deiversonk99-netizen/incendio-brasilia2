-- ============================================================
-- RBAC e RLS do fluxo de tarefas/quadros/usuários
-- Executar depois de:
--   1. migration_rbac_status.sql
--   2. migration_rbac_tables.sql
--   3. sync_user_profile_ids.sql
--   4. create_task_board_rpc.sql
-- ============================================================

BEGIN;

-- Normaliza os papéis aceitos, inclusive SUPERADMIN.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE role IS NULL OR role NOT IN ('SUPERADMIN', 'ADMIN', 'MANAGER', 'USER', 'FUNCIONARIO')
    ) THEN
        RAISE EXCEPTION 'Existem papéis de usuário desconhecidos; RLS não foi alterado';
    END IF;
END $$;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS check_user_role;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT check_user_role
    CHECK (role IN ('SUPERADMIN', 'ADMIN', 'MANAGER', 'USER', 'FUNCIONARIO'));

-- Auditoria mínima para saber quem criou e quem atribuiu uma tarefa.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_by uuid;

UPDATE public.tasks
SET created_by = COALESCE(created_by, user_id)
WHERE created_by IS NULL;

UPDATE public.tasks
SET assigned_by = COALESCE(assigned_by, created_by, user_id)
WHERE assigned_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks(assignee, status);

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT COALESCE((
        SELECT up.role::text
        FROM public.user_profiles up
        WHERE (up.id = auth.uid()
            OR lower(up.email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
          AND COALESCE(up.status, 'ACTIVE') = 'ACTIVE'
        ORDER BY CASE WHEN up.id = auth.uid() THEN 0 ELSE 1 END
        LIMIT 1
    ), 'UNAUTHORIZED');
$$;

CREATE OR REPLACE FUNCTION public.can_access_task_board(p_board_id uuid, p_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role text := public.current_user_role();
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF v_role = 'UNAUTHORIZED' THEN
        RETURN false;
    END IF;

    IF v_role IN ('ADMIN', 'SUPERADMIN') THEN
        RETURN true;
    END IF;

    IF NOT p_write AND v_role = 'MANAGER' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.task_boards tb
            WHERE tb.id = p_board_id
              AND COALESCE(tb.is_visible, true) = true
        );
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.task_boards tb
        LEFT JOIN public.board_members bm
          ON bm.board_id = tb.id AND bm.user_id = auth.uid()
        WHERE tb.id = p_board_id
          AND COALESCE(tb.is_visible, true) = true
          AND (
              tb.user_id = auth.uid()
              OR bm.access_level IN ('OWNER', 'EDITOR')
              OR (NOT p_write AND bm.access_level = 'VIEWER')
          )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT public.current_user_role() <> 'UNAUTHORIZED' AND EXISTS (
        SELECT 1
        FROM public.tasks t
        LEFT JOIN public.task_groups tg ON tg.id = t.group_id
        WHERE t.id = p_task_id
          AND (
              public.current_user_role() IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
              OR t.user_id = auth.uid()
              OR t.assignee = auth.uid()
              OR public.can_access_task_board(tg.board_id, false)
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.protect_task_assignment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role text := public.current_user_role();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(NEW.created_by, auth.uid());
        NEW.assigned_by := COALESCE(NEW.assigned_by, auth.uid());
        RETURN NEW;
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'O autor original da tarefa não pode ser alterado';
    END IF;

    IF v_role NOT IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
       AND (NEW.assignee IS DISTINCT FROM OLD.assignee
            OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
        RAISE EXCEPTION 'Seu perfil não pode reatribuir a tarefa';
    END IF;

    IF NEW.assignee IS DISTINCT FROM OLD.assignee THEN
        NEW.assigned_by := auth.uid();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_task_assignment_fields_trigger ON public.tasks;
CREATE TRIGGER protect_task_assignment_fields_trigger
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.protect_task_assignment_fields();

-- Remove políticas antigas destas tabelas para evitar que uma regra permissiva
-- continue liberando dados (políticas RLS permissivas são combinadas com OR).
DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'user_profiles', 'task_boards', 'task_groups', 'tasks',
              'task_checklist_items', 'board_members', 'teams', 'team_members'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            v_policy.policyname, v_policy.schemaname, v_policy.tablename);
    END LOOP;
END $$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Perfis: cada pessoa lê o próprio perfil; gerentes leem a lista para
-- delegação; somente ADMIN/SUPERADMIN alteram contas.
CREATE POLICY user_profiles_select_policy ON public.user_profiles
FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    OR public.current_user_role() IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
);

CREATE POLICY user_profiles_insert_policy ON public.user_profiles
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'SUPERADMIN'
    OR (public.current_user_role() = 'ADMIN' AND role NOT IN ('ADMIN', 'SUPERADMIN'))
);

CREATE POLICY user_profiles_update_policy ON public.user_profiles
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'SUPERADMIN'
    OR (public.current_user_role() = 'ADMIN' AND role NOT IN ('ADMIN', 'SUPERADMIN'))
)
WITH CHECK (
    public.current_user_role() = 'SUPERADMIN'
    OR (public.current_user_role() = 'ADMIN' AND role NOT IN ('ADMIN', 'SUPERADMIN'))
);

CREATE POLICY user_profiles_delete_policy ON public.user_profiles
FOR DELETE TO authenticated
USING (
    public.current_user_role() = 'SUPERADMIN'
    OR (public.current_user_role() = 'ADMIN' AND role NOT IN ('ADMIN', 'SUPERADMIN'))
);

-- Quadros: leitura do proprietário/membro; gerente monitora quadros visíveis;
-- criação e administração global somente por ADMIN/SUPERADMIN.
CREATE POLICY task_boards_select_policy ON public.task_boards
FOR SELECT TO authenticated
USING (public.can_access_task_board(id, false));

CREATE POLICY task_boards_insert_policy ON public.task_boards
FOR INSERT TO authenticated
WITH CHECK (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

CREATE POLICY task_boards_update_policy ON public.task_boards
FOR UPDATE TO authenticated
USING (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'))
WITH CHECK (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

CREATE POLICY task_boards_delete_policy ON public.task_boards
FOR DELETE TO authenticated
USING (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

CREATE POLICY task_groups_select_policy ON public.task_groups
FOR SELECT TO authenticated
USING (public.can_access_task_board(board_id, false));

CREATE POLICY task_groups_insert_policy ON public.task_groups
FOR INSERT TO authenticated
WITH CHECK (public.can_access_task_board(board_id, true));

CREATE POLICY task_groups_update_policy ON public.task_groups
FOR UPDATE TO authenticated
USING (public.can_access_task_board(board_id, true))
WITH CHECK (public.can_access_task_board(board_id, true));

CREATE POLICY task_groups_delete_policy ON public.task_groups
FOR DELETE TO authenticated
USING (public.can_access_task_board(board_id, true));

-- Tarefas: USER/FUNCIONARIO acessa tarefas próprias ou atribuídas a ele;
-- MANAGER monitora/delega; ADMIN/SUPERADMIN administram.
CREATE POLICY tasks_select_policy ON public.tasks
FOR SELECT TO authenticated
USING (public.can_access_task(id));

CREATE POLICY tasks_insert_policy ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() IN ('ADMIN', 'SUPERADMIN')
    OR (
        public.current_user_role() = 'MANAGER'
        AND EXISTS (
            SELECT 1 FROM public.task_groups tg
            WHERE tg.id = group_id
              AND public.can_access_task_board(tg.board_id, false)
        )
    )
    OR (
        public.current_user_role() IN ('USER', 'FUNCIONARIO')
        AND
        user_id = auth.uid()
        AND COALESCE(assignee, auth.uid()) = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.task_groups tg
            WHERE tg.id = group_id
              AND public.can_access_task_board(tg.board_id, true)
        )
    )
);

CREATE POLICY tasks_update_policy ON public.tasks
FOR UPDATE TO authenticated
USING (public.can_access_task(id))
WITH CHECK (
    public.current_user_role() IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
    OR (
        public.current_user_role() IN ('USER', 'FUNCIONARIO')
        AND (user_id = auth.uid() OR assignee = auth.uid())
    )
);

CREATE POLICY tasks_delete_policy ON public.tasks
FOR DELETE TO authenticated
USING (
    public.current_user_role() IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
    OR (public.current_user_role() IN ('USER', 'FUNCIONARIO') AND user_id = auth.uid())
);

CREATE POLICY task_checklist_select_policy ON public.task_checklist_items
FOR SELECT TO authenticated
USING (public.can_access_task(task_id));

CREATE POLICY task_checklist_insert_policy ON public.task_checklist_items
FOR INSERT TO authenticated
WITH CHECK (public.can_access_task(task_id));

CREATE POLICY task_checklist_update_policy ON public.task_checklist_items
FOR UPDATE TO authenticated
USING (public.can_access_task(task_id))
WITH CHECK (public.can_access_task(task_id));

CREATE POLICY task_checklist_delete_policy ON public.task_checklist_items
FOR DELETE TO authenticated
USING (public.can_access_task(task_id));

CREATE POLICY board_members_select_policy ON public.board_members
FOR SELECT TO authenticated
USING (
    (public.current_user_role() <> 'UNAUTHORIZED' AND user_id = auth.uid())
    OR public.current_user_role() IN ('MANAGER', 'ADMIN', 'SUPERADMIN')
);

CREATE POLICY board_members_admin_policy ON public.board_members
FOR ALL TO authenticated
USING (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'))
WITH CHECK (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

CREATE POLICY teams_select_policy ON public.teams
FOR SELECT TO authenticated
USING (
    public.current_user_role() IN ('ADMIN', 'SUPERADMIN')
    OR (public.current_user_role() <> 'UNAUTHORIZED' AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()
    ))
);

CREATE POLICY teams_admin_policy ON public.teams
FOR ALL TO authenticated
USING (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'))
WITH CHECK (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

CREATE POLICY team_members_select_policy ON public.team_members
FOR SELECT TO authenticated
USING (
    (public.current_user_role() <> 'UNAUTHORIZED' AND user_id = auth.uid())
    OR public.current_user_role() IN ('ADMIN', 'SUPERADMIN')
);

CREATE POLICY team_members_admin_policy ON public.team_members
FOR ALL TO authenticated
USING (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'))
WITH CHECK (public.current_user_role() IN ('ADMIN', 'SUPERADMIN'));

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_task_board(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_task_board(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;

COMMIT;
