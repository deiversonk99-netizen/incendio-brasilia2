select
  count(*) as backed_up_items,
  count(distinct backup.project_id) as affected_projects,
  count(*) filter (where backup.project_number = '202') as repaired_items_pr202,
  count(*) filter (
    where item.unit_price is distinct from backup.catalog_unit_price
  ) as composition_prices_not_repaired,
  count(*) filter (
    where item.proposal_unit_price is distinct from backup.old_proposal_unit_price
  ) as changed_proposal_prices
from public.composition_price_repair_backup_20261008 backup
join public.budget_items item
  on item.id = backup.budget_item_id;

select count(*) as changed_project_totals
from (
  select distinct project_id, old_project_value
  from public.composition_price_repair_backup_20261008
) backup
join public.projects project
  on project.id = backup.project_id
where project.value is distinct from backup.old_project_value;

select
  project.project_number,
  item.name,
  backup.old_unit_price as old_composition_price,
  item.unit_price as repaired_composition_price,
  item.proposal_unit_price,
  backup.old_project_value,
  project.value as current_project_value
from public.composition_price_repair_backup_20261008 backup
join public.budget_items item
  on item.id = backup.budget_item_id
join public.projects project
  on project.id = backup.project_id
where backup.project_number = '202'
order by item.name;

