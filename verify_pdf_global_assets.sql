-- Read-only checks to run after migration_pdf_global_assets.sql.

SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'app_settings';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'app_settings'
ORDER BY policyname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'pdf-assets';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (qual ILIKE '%pdf-assets%' OR with_check ILIKE '%pdf-assets%')
ORDER BY policyname;

SELECT
    key,
    value ->> 'cert_crq_storage_path' AS cert_crq_storage_path,
    value ->> 'cert_crq_file_name' AS cert_crq_file_name,
    value ->> 'cert_crq_updated_at' AS cert_crq_updated_at
FROM public.app_settings
WHERE key = 'pdf_global_config';
