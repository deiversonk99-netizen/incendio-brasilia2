-- Restores only the composition prices changed by
-- migration_repair_historical_composition_prices.sql.
-- Proposal prices and project totals are not touched.

begin;

alter table public.budget_items
  disable trigger sync_project_value_after_budget_item_change;

update public.budget_items item
set
  unit_price = backup.old_unit_price,
  sync_with_catalog = backup.old_sync_with_catalog
from public.composition_price_repair_backup_20261008 backup
where item.id = backup.budget_item_id;

alter table public.budget_items
  enable trigger sync_project_value_after_budget_item_change;

do $validation$
declare
  incorrect_restores bigint;
  changed_proposal_prices bigint;
begin
  select count(*)
  into incorrect_restores
  from public.composition_price_repair_backup_20261008 backup
  join public.budget_items item
    on item.id = backup.budget_item_id
  where item.unit_price is distinct from backup.old_unit_price;

  select count(*)
  into changed_proposal_prices
  from public.composition_price_repair_backup_20261008 backup
  join public.budget_items item
    on item.id = backup.budget_item_id
  where item.proposal_unit_price is distinct from backup.old_proposal_unit_price;

  if incorrect_restores <> 0 then
    raise exception 'Rollback aborted: % composition prices were not restored', incorrect_restores;
  end if;

  if changed_proposal_prices <> 0 then
    raise exception 'Rollback aborted: % proposal prices differ from the backup', changed_proposal_prices;
  end if;
end
$validation$;

commit;

select count(*) as restored_items
from public.composition_price_repair_backup_20261008;

