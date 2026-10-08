-- Run only after rolling the frontend back to the version that predates
-- proposal_unit_price. It preserves the latest proposal values for that legacy
-- frontend, which again makes unit_price shared by both interfaces.

begin;

update public.budget_items
set unit_price = coalesce(proposal_unit_price, unit_price);

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
    coalesce(quantity_final, 0) * coalesce(unit_price, 0)
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

alter table public.budget_items
  drop column if exists proposal_unit_price;

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
