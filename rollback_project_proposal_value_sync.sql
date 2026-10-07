-- Run only after rolling the frontend back to the previous version.

begin;

drop trigger if exists sync_project_value_after_budget_item_change
  on public.budget_items;
drop trigger if exists sync_project_value_after_proposal_change
  on public.proposals;

drop function if exists public.sync_project_value_from_budget_item();
drop function if exists public.sync_project_value_from_proposal();

update public.projects project
set value = backup.old_value
from public.project_value_sync_backup_20261007 backup
where project.id = backup.project_id;

drop function if exists public.recalculate_project_value(uuid);
drop table if exists public.project_value_sync_backup_20261007;

commit;
