-- Rollback de disponibilidade para o estado anterior à ativação do RLS.
-- Mantém colunas de auditoria e tabelas novas para não apagar dados.
BEGIN;

ALTER TABLE IF EXISTS public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_boards DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_checklist_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.board_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_members DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS protect_task_assignment_fields_trigger ON public.tasks;
DROP TRIGGER IF EXISTS link_task_boards_after_profile_activation_trigger ON public.user_profiles;

-- Restaura papéis e permissões existentes antes da implantação.
UPDATE public.user_profiles current_profile
SET role = backup_profile.role,
    permissions = backup_profile.permissions
FROM deployment_backup.task_flow_20260829_user_profiles backup_profile
WHERE lower(current_profile.email) = lower(backup_profile.email);

COMMIT;
