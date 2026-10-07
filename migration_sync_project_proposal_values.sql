-- Keeps projects.value equal to the total shown in the commercial proposal.
-- Apply this migration before deploying the matching frontend.

begin;

-- Preserve the pre-migration values so the data backfill is reversible.
create table if not exists public.project_value_sync_backup_20261007 (
  project_id uuid primary key,
  old_value numeric,
  backed_up_at timestamptz not null default now()
);

insert into public.project_value_sync_backup_20261007 (project_id, old_value)
select id, value
from public.projects
on conflict (project_id) do nothing;

revoke all on table public.project_value_sync_backup_20261007 from public;
revoke all on table public.project_value_sync_backup_20261007 from anon;
revoke all on table public.project_value_sync_backup_20261007 from authenticated;

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

-- The function is an internal consistency mechanism, not a public RPC.
revoke all on function public.recalculate_project_value(uuid) from public;
revoke all on function public.recalculate_project_value(uuid) from anon;
revoke all on function public.recalculate_project_value(uuid) from authenticated;

create or replace function public.sync_project_value_from_budget_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_project_value(old.project_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.recalculate_project_value(old.project_id);
  end if;

  perform public.recalculate_project_value(new.project_id);
  return new;
end;
$function$;

revoke all on function public.sync_project_value_from_budget_item() from public;
revoke all on function public.sync_project_value_from_budget_item() from anon;
revoke all on function public.sync_project_value_from_budget_item() from authenticated;

create or replace function public.sync_project_value_from_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_project_value(old.project_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.recalculate_project_value(old.project_id);
  end if;

  perform public.recalculate_project_value(new.project_id);
  return new;
end;
$function$;

revoke all on function public.sync_project_value_from_proposal() from public;
revoke all on function public.sync_project_value_from_proposal() from anon;
revoke all on function public.sync_project_value_from_proposal() from authenticated;

drop trigger if exists sync_project_value_after_budget_item_change
  on public.budget_items;

create constraint trigger sync_project_value_after_budget_item_change
after insert or update or delete on public.budget_items
deferrable initially deferred
for each row
execute function public.sync_project_value_from_budget_item();

drop trigger if exists sync_project_value_after_proposal_change
  on public.proposals;

create constraint trigger sync_project_value_after_proposal_change
after insert or update or delete on public.proposals
deferrable initially deferred
for each row
execute function public.sync_project_value_from_proposal();

-- Supabase Realtime is used by the Dashboard to receive the new value without
-- a full page reload. The guard keeps the migration safe to run again.
do $block$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    execute 'alter publication supabase_realtime add table public.projects';
  end if;
end;
$block$;

-- Align all existing Dashboard values with the current proposal calculation.
-- Projects that have never had proposal data keep their manually entered value.
select public.recalculate_project_value(id)
from public.projects project
where exists (
  select 1 from public.budget_items item where item.project_id = project.id
)
or exists (
  select 1 from public.proposals proposal where proposal.project_id = project.id
);

commit;
