-- Repairs only composition sale prices that can be proven to have been
-- overwritten by the former proposal markup calculation.
--
-- Safety guarantees:
--   * proposal_unit_price is never updated;
--   * projects.value is never recalculated or updated;
--   * only catalog-linked items with a positive catalog price are eligible;
--   * the current composition price must exactly match the former
--     cost * BDI * profit formula and the preserved proposal price;
--   * every affected row is backed up before the update.

begin;

create table if not exists public.composition_price_repair_backup_20261008 (
  budget_item_id uuid primary key,
  project_id uuid not null,
  project_number text,
  item_name text not null,
  old_unit_price numeric,
  old_proposal_unit_price numeric,
  old_project_value numeric,
  catalog_unit_price numeric not null,
  bdi_percent numeric,
  profit_percent numeric,
  apply_bdi boolean,
  apply_profit boolean,
  old_sync_with_catalog boolean,
  backed_up_at timestamptz not null default now()
);

revoke all on table public.composition_price_repair_backup_20261008
  from public, anon, authenticated;

create temporary table composition_price_repair_targets_20261008
on commit drop
as
with latest_proposal as (
  select distinct on (project_id)
    project_id,
    bdi_percent,
    profit_percent
  from public.proposals
  order by project_id, updated_at desc nulls last, created_at desc nulls last
)
select
  item.id as budget_item_id,
  item.project_id,
  project.project_number::text as project_number,
  item.name as item_name,
  item.unit_price as old_unit_price,
  item.proposal_unit_price as old_proposal_unit_price,
  project.value as old_project_value,
  catalog.price as catalog_unit_price,
  proposal.bdi_percent,
  proposal.profit_percent,
  item.apply_bdi,
  item.apply_profit,
  item.sync_with_catalog as old_sync_with_catalog
from public.budget_items item
join public.projects project
  on project.id = item.project_id
join latest_proposal proposal
  on proposal.project_id = item.project_id
join public.product_catalog catalog
  on catalog.id = item.product_id
where item.cost_price > 0
  and catalog.price > 0
  and item.proposal_unit_price is not null
  and abs(item.unit_price - item.proposal_unit_price) < 0.0001
  and abs(item.unit_price - (
    item.cost_price
      * case
          when item.apply_bdi is distinct from false
            then 1 + coalesce(proposal.bdi_percent, 0) / 100
          else 1
        end
      * case
          when item.apply_profit is distinct from false
            then 1 + coalesce(proposal.profit_percent, 0) / 100
          else 1
        end
  )) < 0.01
  and abs(item.unit_price - catalog.price) >= 0.01;

insert into public.composition_price_repair_backup_20261008 (
  budget_item_id,
  project_id,
  project_number,
  item_name,
  old_unit_price,
  old_proposal_unit_price,
  old_project_value,
  catalog_unit_price,
  bdi_percent,
  profit_percent,
  apply_bdi,
  apply_profit,
  old_sync_with_catalog
)
select
  budget_item_id,
  project_id,
  project_number,
  item_name,
  old_unit_price,
  old_proposal_unit_price,
  old_project_value,
  catalog_unit_price,
  bdi_percent,
  profit_percent,
  apply_bdi,
  apply_profit,
  old_sync_with_catalog
from composition_price_repair_targets_20261008
on conflict (budget_item_id) do nothing;

-- Updating unit_price normally invokes the project-value trigger. Disable only
-- that trigger during this repair so projects.value cannot change. Future
-- writes regain the normal synchronization immediately afterward.
alter table public.budget_items
  disable trigger sync_project_value_after_budget_item_change;

update public.budget_items item
set unit_price = target.catalog_unit_price
from composition_price_repair_targets_20261008 target
where item.id = target.budget_item_id;

alter table public.budget_items
  enable trigger sync_project_value_after_budget_item_change;

do $validation$
declare
  changed_proposal_prices bigint;
  changed_project_values bigint;
  incorrect_composition_prices bigint;
begin
  select count(*)
  into changed_proposal_prices
  from composition_price_repair_targets_20261008 target
  join public.budget_items item
    on item.id = target.budget_item_id
  where item.proposal_unit_price is distinct from target.old_proposal_unit_price;

  select count(distinct target.project_id)
  into changed_project_values
  from composition_price_repair_targets_20261008 target
  join public.projects project
    on project.id = target.project_id
  where project.value is distinct from target.old_project_value;

  select count(*)
  into incorrect_composition_prices
  from composition_price_repair_targets_20261008 target
  join public.budget_items item
    on item.id = target.budget_item_id
  where item.unit_price is distinct from target.catalog_unit_price;

  if changed_proposal_prices <> 0 then
    raise exception 'Repair aborted: % proposal prices changed', changed_proposal_prices;
  end if;

  if changed_project_values <> 0 then
    raise exception 'Repair aborted: % project totals changed', changed_project_values;
  end if;

  if incorrect_composition_prices <> 0 then
    raise exception 'Repair aborted: % composition prices were not repaired', incorrect_composition_prices;
  end if;
end
$validation$;

commit;

select
  count(*) as repaired_items,
  count(distinct project_id) as repaired_projects,
  count(*) filter (where project_number = '202') as repaired_items_pr202
from public.composition_price_repair_backup_20261008;

