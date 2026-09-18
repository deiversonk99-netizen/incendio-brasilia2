-- Links proposal items to the product catalog without overwriting intentional
-- manual prices. Run this migration before deploying the matching frontend.

begin;

alter table public.budget_items
  add column if not exists product_id uuid,
  add column if not exists sync_with_catalog boolean;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budget_items_product_id_fkey'
      and conrelid = 'public.budget_items'::regclass
  ) then
    alter table public.budget_items
      add constraint budget_items_product_id_fkey
      foreign key (product_id)
      references public.product_catalog(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_budget_items_product_id
  on public.budget_items(product_id);

-- Recover the catalog link for legacy rows using the same normalization used
-- by the application for [MODELO: ...] prefixes and [INFRA: ...] suffixes.
with normalized_catalog as (
  select
    id,
    lower(regexp_replace(trim(name), '\s+', ' ', 'g')) as normalized_name
  from public.product_catalog
),
normalized_budget as (
  select
    id,
    lower(
      regexp_replace(
        trim(
          regexp_replace(
            regexp_replace(name, '^\[MODELO:[^]]+\]\s*', '', 'i'),
            '\s*\[INFRA:[^]]+\]\s*$',
            '',
            'i'
          )
        ),
        '\s+',
        ' ',
        'g'
      )
    ) as normalized_name
  from public.budget_items
  where item_type = 'PRODUCT'
)
update public.budget_items bi
set product_id = pc.id
from normalized_budget nb
join normalized_catalog pc on pc.normalized_name = nb.normalized_name
where bi.id = nb.id
  and bi.product_id is null;

-- Existing calculated/model/infra items are known catalog snapshots and can
-- be synchronized safely. Plain legacy manual items remain protected because
-- the database cannot distinguish a catalog selection from a negotiated price.
update public.budget_items
set sync_with_catalog = case
  when item_type = 'PRODUCT'
    and product_id is not null
    and (
      origin = 'CALCULATED'
      or name ~* '^\[MODELO:'
      or name ~* '\[INFRA:'
    )
  then true
  else false
end
where sync_with_catalog is null;

alter table public.budget_items
  alter column sync_with_catalog set default false,
  alter column sync_with_catalog set not null;

comment on column public.budget_items.product_id is
  'Catalog product that originated this proposal item.';

comment on column public.budget_items.sync_with_catalog is
  'When true, catalog cost/sale changes are applied when the proposal is loaded.';

-- Keep catalog linkage, per-item markup switches and observations when a
-- proposal is duplicated. The existing function already uses explicit column
-- lists, so this remains compatible with the current schema.
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
    unit_price, cost_price, origin, item_type,
    apply_bdi, apply_profit, observation,
    product_id, sync_with_catalog
  )
  select
    new_project_id, name, quantity_calculated, quantity_final,
    unit_price, cost_price, origin, item_type,
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
  where project_id = source_project_id;

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
