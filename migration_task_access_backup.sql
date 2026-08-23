-- Backup lógico anterior à implantação de RBAC/RLS.
-- Não altera as tabelas usadas pela aplicação.
BEGIN;

CREATE SCHEMA IF NOT EXISTS deployment_backup;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_user_profiles
AS TABLE public.user_profiles WITH DATA;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_task_boards
AS TABLE public.task_boards WITH DATA;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_task_groups
AS TABLE public.task_groups WITH DATA;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_tasks
AS TABLE public.tasks WITH DATA;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_task_checklist_items
AS TABLE public.task_checklist_items WITH DATA;

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_policies AS
SELECT *
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  );

CREATE TABLE IF NOT EXISTS deployment_backup.task_access_20260822_rls_state AS
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  );

COMMIT;
