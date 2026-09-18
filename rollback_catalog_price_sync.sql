-- Roll back only after deploying the previous frontend version. The price and
-- cost snapshots already stored in budget_items are preserved.

begin;

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
    unit_price, cost_price, origin, item_type
  )
  select
    new_project_id, name, quantity_calculated, quantity_final,
    unit_price, cost_price, origin, item_type
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

alter table public.budget_items
  drop column if exists sync_with_catalog,
  drop column if exists product_id;

commit;
