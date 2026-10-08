-- Separates the engineering composition price from the commercial proposal
-- price without changing any value currently shown in either interface.
-- Apply this migration before deploying the matching frontend.

begin;

-- Immutable safety snapshots. The new column is initialized from unit_price,
-- so both interfaces keep exactly the values they had before this migration.
create table if not exists public.budget_item_price_separation_backup_20261008 (
  budget_item_id uuid primary key,
  project_id uuid not null,
  old_unit_price numeric,
  backed_up_at timestamptz not null default now()
);

insert into public.budget_item_price_separation_backup_20261008 (
  budget_item_id,
  project_id,
  old_unit_price
)
select id, project_id, unit_price
from public.budget_items
on conflict (budget_item_id) do nothing;

create table if not exists public.project_value_price_separation_backup_20261008 (
  project_id uuid primary key,
  old_value numeric,
  backed_up_at timestamptz not null default now()
);

insert into public.project_value_price_separation_backup_20261008 (
  project_id,
  old_value
)
select id, value
from public.projects
on conflict (project_id) do nothing;

revoke all on table public.budget_item_price_separation_backup_20261008 from public;
revoke all on table public.budget_item_price_separation_backup_20261008 from anon;
revoke all on table public.budget_item_price_separation_backup_20261008 from authenticated;
revoke all on table public.project_value_price_separation_backup_20261008 from public;
revoke all on table public.project_value_price_separation_backup_20261008 from anon;
revoke all on table public.project_value_price_separation_backup_20261008 from authenticated;

alter table public.budget_items
  add column if not exists proposal_unit_price numeric;

comment on column public.budget_items.unit_price is
  'Base/reference sale price used by the engineering composition.';

comment on column public.budget_items.proposal_unit_price is
  'Final item sale price used by the commercial proposal. Null falls back to unit_price.';

-- Preserve every current proposal value byte-for-byte. This is deliberately
-- not a recalculation and does not round or normalize legacy data.
-- Temporarily removing the value trigger guarantees the backfill cannot alter
-- projects.value, even if a legacy dashboard row was already inconsistent.
drop trigger if exists sync_project_value_after_budget_item_change
  on public.budget_items;

update public.budget_items
set proposal_unit_price = unit_price
where proposal_unit_price is null;

-- Dashboard totals now use the dedicated proposal price. COALESCE keeps new
-- composition items compatible until they are first recalculated/saved in the
-- proposal.
create or replace function public.recalculate_project_value(p_project_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $function$
declare
  gross_value numeric := 0;
  proposal_discount_type text := 'FIXED';
  proposal_discount_value numeric := 0;
  calculated_value numeric := 0;
begin
  if p_project_id is null then
    return 0;
  end if;

  select coalesce(sum(
    coalesce(quantity_final, 0)
      * coalesce(proposal_unit_price, unit_price, 0)
  ), 0)
  into gross_value
  from public.budget_items
  where project_id = p_project_id;

  select
    coalesce(discount_type, 'FIXED'),
    coalesce(discount_value, 0)
  into proposal_discount_type, proposal_discount_value
  from public.proposals
  where project_id = p_project_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if not found then
    proposal_discount_type := 'FIXED';
    proposal_discount_value := 0;
  end if;

  if proposal_discount_type = 'FIXED' then
    calculated_value := gross_value - proposal_discount_value;
  else
    calculated_value := gross_value - (gross_value * proposal_discount_value / 100);
  end if;

  calculated_value := round(coalesce(calculated_value, 0), 2);

  update public.projects
  set value = calculated_value
  where id = p_project_id
    and value is distinct from calculated_value;

  return calculated_value;
end;
$function$;

revoke all on function public.recalculate_project_value(uuid) from public;
revoke all on function public.recalculate_project_value(uuid) from anon;
revoke all on function public.recalculate_project_value(uuid) from authenticated;

create constraint trigger sync_project_value_after_budget_item_change
after insert or update or delete on public.budget_items
deferrable initially deferred
for each row
execute function public.sync_project_value_from_budget_item();

-- Project duplication must preserve both price layers.
create or replace function public.clone_project_data(source_project_id uuid, new_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_project_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  insert into projects (
    name, client, status, user_id, blueprint_url,
    internal_observations, value, deadline, type
  )
  select
    new_name, client, status, coalesce(current_user_id, user_id), blueprint_url,
    internal_observations, value, deadline, type
  from projects
  where id = source_project_id
  returning id into new_project_id;

  insert into project_services (project_id, service_id)
  select new_project_id, service_id
  from project_services
  where project_id = source_project_id;

  insert into floors (
    project_id, name, type, prancha, width, length, height,
    replication_factor, calculation_type, items
  )
  select
    new_project_id, name, type, prancha, width, length, height,
    replication_factor, calculation_type, items
  from floors
  where project_id = source_project_id;

  insert into budget_items (
    project_id, name, quantity_calculated, quantity_final,
    unit_price, proposal_unit_price, cost_price, origin, item_type,
    apply_bdi, apply_profit, observation,
    product_id, sync_with_catalog
  )
  select
    new_project_id, name, quantity_calculated, quantity_final,
    unit_price, proposal_unit_price, cost_price, origin, item_type,
    apply_bdi, apply_profit, observation,
    product_id, sync_with_catalog
  from budget_items
  where project_id = source_project_id;

  insert into proposals (
    project_id, user_id, cost_material_base, bdi_percent, profit_percent,
    discount_type, discount_value, payment_conditions, execution_schedule,
    validity_days, observations, hide_services_pdf, hide_products_pdf,
    status, proposal_number
  )
  select
    new_project_id, coalesce(current_user_id, user_id), cost_material_base,
    bdi_percent, profit_percent, discount_type, discount_value,
    payment_conditions, execution_schedule, validity_days, observations,
    hide_services_pdf, hide_products_pdf, status,
    (select coalesce(max(proposal_number), 0) + 1 from proposals)
  from proposals
  where project_id = source_project_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  insert into proposal_sections (project_id, title, content, order_index, is_active)
  select new_project_id, title, content, order_index, is_active
  from proposal_sections
  where project_id = source_project_id;

  insert into pdf_settings (project_id, phase, variables)
  select new_project_id, phase, variables
  from pdf_settings
  where project_id = source_project_id;

  return new_project_id;
end;
$function$;

commit;

-- Expected result: all three mismatch counts are zero.
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
