-- Validação sem escrita. Se qualquer regra crítica falhar, a implantação
-- deve ser interrompida antes das migrations.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.user_profiles
        GROUP BY lower(email)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem e-mails duplicados em user_profiles';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE role IS NULL OR role NOT IN ('SUPERADMIN', 'ADMIN', 'MANAGER', 'USER', 'FUNCIONARIO')
    ) THEN
        RAISE EXCEPTION 'Existem papéis de usuário incompatíveis';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles WHERE role IN ('ADMIN', 'SUPERADMIN')
    ) THEN
        RAISE EXCEPTION 'Não existe administrador cadastrado';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE p.id IS NOT NULL AND u.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Existe perfil ligado a um auth.users inexistente';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tasks
        WHERE status IS NOT NULL
          AND status NOT IN ('PENDING', 'BUYING', 'INSTALLATION', 'DONE')
    ) THEN
        RAISE EXCEPTION 'Existem status de tarefa incompatíveis';
    END IF;
END $$;

SELECT
    (SELECT count(*) FROM public.user_profiles) AS profiles,
    (SELECT count(*) FROM public.task_boards) AS boards,
    (SELECT count(*) FROM public.task_groups) AS groups,
    (SELECT count(*) FROM public.tasks) AS tasks,
    (SELECT count(*) FROM public.task_checklist_items) AS checklist_items;
