-- Read-only post-deployment checks for migration_catalog_price_sync.sql.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'budget_items'
  and column_name in ('product_id', 'sync_with_catalog')
order by column_name;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.budget_items'::regclass
  and conname = 'budget_items_product_id_fkey';

select
  count(*) filter (where sync_with_catalog and product_id is null) as invalid_synced_items,
  count(*) filter (where sync_with_catalog) as synchronized_items,
  count(*) filter (where not sync_with_catalog) as protected_manual_items
from public.budget_items;

select
  position('sync_with_catalog' in pg_get_functiondef(p.oid)) > 0 as clone_keeps_sync_mode,
  position('product_id' in pg_get_functiondef(p.oid)) > 0 as clone_keeps_product_link
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'clone_project_data';
