-- Read-only checks for migration_sync_project_proposal_values.sql.

with latest_proposal as (
  select distinct on (project_id)
    project_id,
    coalesce(discount_type, 'FIXED') as discount_type,
    coalesce(discount_value, 0) as discount_value
  from public.proposals
  order by project_id, updated_at desc nulls last, created_at desc nulls last
),
gross_values as (
  select
    project_id,
    coalesce(sum(coalesce(quantity_final, 0) * coalesce(unit_price, 0)), 0) as gross_value
  from public.budget_items
  group by project_id
),
expected_values as (
  select
    project.id,
    project.name,
    coalesce(gross.gross_value, 0) as gross_value,
    round(
      case
        when coalesce(proposal.discount_type, 'FIXED') = 'FIXED'
          then coalesce(gross.gross_value, 0) - coalesce(proposal.discount_value, 0)
        else coalesce(gross.gross_value, 0)
          - (coalesce(gross.gross_value, 0) * coalesce(proposal.discount_value, 0) / 100)
      end,
      2
    ) as expected_value,
    round(coalesce(project.value, 0), 2) as dashboard_value
  from public.projects project
  left join gross_values gross on gross.project_id = project.id
  left join latest_proposal proposal on proposal.project_id = project.id
  where gross.project_id is not null
    or proposal.project_id is not null
)
select
  count(*) as project_count,
  count(*) filter (where dashboard_value is distinct from expected_value) as mismatched_projects,
  max(abs(dashboard_value - expected_value)) as largest_difference
from expected_values;

-- Detail any remaining mismatch (zero rows is the expected result).
with latest_proposal as (
  select distinct on (project_id)
    project_id,
    coalesce(discount_type, 'FIXED') as discount_type,
    coalesce(discount_value, 0) as discount_value
  from public.proposals
  order by project_id, updated_at desc nulls last, created_at desc nulls last
),
gross_values as (
  select
    project_id,
    coalesce(sum(coalesce(quantity_final, 0) * coalesce(unit_price, 0)), 0) as gross_value
  from public.budget_items
  group by project_id
)
select
  project.id,
  project.name,
  round(coalesce(project.value, 0), 2) as dashboard_value,
  round(
    case
      when coalesce(proposal.discount_type, 'FIXED') = 'FIXED'
        then coalesce(gross.gross_value, 0) - coalesce(proposal.discount_value, 0)
      else coalesce(gross.gross_value, 0)
        - (coalesce(gross.gross_value, 0) * coalesce(proposal.discount_value, 0) / 100)
    end,
    2
  ) as proposal_value
from public.projects project
left join gross_values gross on gross.project_id = project.id
left join latest_proposal proposal on proposal.project_id = project.id
where (gross.project_id is not null or proposal.project_id is not null)
and round(coalesce(project.value, 0), 2) is distinct from round(
  case
    when coalesce(proposal.discount_type, 'FIXED') = 'FIXED'
      then coalesce(gross.gross_value, 0) - coalesce(proposal.discount_value, 0)
    else coalesce(gross.gross_value, 0)
      - (coalesce(gross.gross_value, 0) * coalesce(proposal.discount_value, 0) / 100)
  end,
  2
)
order by project.name;

select
  trigger_name,
  event_object_table,
  action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'sync_project_value_after_budget_item_change',
    'sync_project_value_after_proposal_change'
  )
order by trigger_name;

select exists (
  select 1
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'projects'
) as projects_realtime_enabled;
