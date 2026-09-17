-- Global PDF assets used by every engineering proposal.
-- Safe to run more than once.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Replace legacy app_settings policies with one explicit access model:
-- every signed-in user may read defaults, only active admins may change them.
DO $$
DECLARE
    existing_policy record;
BEGIN
    FOR existing_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'app_settings'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.app_settings', existing_policy.policyname);
    END LOOP;
END;
$$;

CREATE POLICY app_settings_authenticated_read
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY app_settings_admin_insert
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
);

CREATE POLICY app_settings_admin_update
ON public.app_settings
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pdf-assets',
    'pdf-assets',
    false,
    10485760,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can read PDF assets" ON storage.objects;
CREATE POLICY "Authenticated users can read PDF assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'pdf-assets');

DROP POLICY IF EXISTS "Admins can insert PDF assets" ON storage.objects;
CREATE POLICY "Admins can insert PDF assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'pdf-assets'
    AND EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
);

DROP POLICY IF EXISTS "Admins can update PDF assets" ON storage.objects;
CREATE POLICY "Admins can update PDF assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'pdf-assets'
    AND EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
)
WITH CHECK (
    bucket_id = 'pdf-assets'
    AND EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
);

DROP POLICY IF EXISTS "Admins can delete PDF assets" ON storage.objects;
CREATE POLICY "Admins can delete PDF assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'pdf-assets'
    AND EXISTS (
        SELECT 1
        FROM public.user_profiles profile
        WHERE profile.id = auth.uid()
          AND profile.status = 'ACTIVE'
          AND profile.role IN ('ADMIN', 'SUPERADMIN')
    )
);
