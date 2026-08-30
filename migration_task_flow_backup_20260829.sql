-- Snapshot lógico imediatamente anterior à ativação do fluxo de tarefas/RLS.
-- Execute uma única vez. A migration principal só deve rodar após este arquivo.
BEGIN;

CREATE SCHEMA IF NOT EXISTS deployment_backup;

CREATE TABLE deployment_backup.task_flow_20260829_user_profiles
AS TABLE public.user_profiles WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_task_boards
AS TABLE public.task_boards WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_task_groups
AS TABLE public.task_groups WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_tasks
AS TABLE public.tasks WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_task_checklist_items
AS TABLE public.task_checklist_items WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_board_members
AS TABLE public.board_members WITH DATA;

CREATE TABLE deployment_backup.task_flow_20260829_policies AS
SELECT *
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  );

CREATE TABLE deployment_backup.task_flow_20260829_rls_state AS
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'user_profiles', 'task_boards', 'task_groups', 'tasks',
      'task_checklist_items', 'board_members', 'teams', 'team_members'
  );

COMMIT;
