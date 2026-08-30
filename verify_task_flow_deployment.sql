-- Verificação somente leitura após a implantação.
SELECT
    (SELECT count(*) FROM public.user_profiles) AS profiles,
    (SELECT count(*) FROM public.task_boards) AS boards,
    (SELECT count(*) FROM public.task_groups) AS groups,
    (SELECT count(*) FROM public.tasks) AS tasks,
    (SELECT count(*) FROM public.task_checklist_items) AS checklist_items;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  )
ORDER BY c.relname;

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  )
ORDER BY tablename, policyname;

SELECT count(*) AS groups_with_wrong_owner
FROM public.task_groups tg
JOIN public.task_boards tb ON tb.id = tg.board_id
WHERE tb.user_id IS NOT NULL
  AND tg.user_id IS DISTINCT FROM tb.user_id;

SELECT count(*) AS owned_boards_without_owner_membership
FROM public.task_boards tb
WHERE tb.user_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.board_members bm
      WHERE bm.board_id = tb.id
        AND bm.user_id = tb.user_id
        AND bm.access_level = 'OWNER'
  );

-- Uma sessão sem auth.uid() não pode receber linhas protegidas.
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS anonymous_tasks_visible FROM public.tasks;
SELECT count(*) AS anonymous_boards_visible FROM public.task_boards;
ROLLBACK;
