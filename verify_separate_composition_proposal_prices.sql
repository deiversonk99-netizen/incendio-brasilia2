-- Read-only checks for migration_separate_composition_proposal_prices.sql.

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'budget_items'
  and column_name in ('unit_price', 'proposal_unit_price')
order by column_name;

select
  count(*) filter (
    where item.unit_price is distinct from backup.old_unit_price
  ) as changed_composition_prices,
  count(*) filter (
    where item.proposal_unit_price is distinct from backup.old_unit_price
  ) as changed_initial_proposal_prices,
  count(*) filter (where item.proposal_unit_price is null) as null_initial_proposal_prices
from public.budget_items item
join public.budget_item_price_separation_backup_20261008 backup
  on backup.budget_item_id = item.id;

select
  count(*) filter (
    where round(coalesce(project.value, 0), 2)
      is distinct from round(coalesce(backup.old_value, 0), 2)
  ) as changed_dashboard_values
from public.projects project
join public.project_value_price_separation_backup_20261008 backup
  on backup.project_id = project.id;

select
  position('proposal_unit_price' in pg_get_functiondef(p.oid)) > 0
    as dashboard_uses_proposal_price
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'recalculate_project_value';

select
  position('proposal_unit_price' in pg_get_functiondef(p.oid)) > 0
    as clone_keeps_proposal_price
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'clone_project_data';
