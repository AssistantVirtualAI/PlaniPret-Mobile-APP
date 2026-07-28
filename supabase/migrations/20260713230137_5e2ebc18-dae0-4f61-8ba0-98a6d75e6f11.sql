
-- 1. Lemtel recordings: scope reads to admins or the customer's portal user
DROP POLICY IF EXISTS "lemtel_recordings_member_select" ON storage.objects;

CREATE POLICY "lemtel_recordings_scoped_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lemtel-recordings'
  AND (
    is_lemtel_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.portal_user_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[2] = c.domain_uuid
    )
    OR EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.portal_user_id = auth.uid()
        AND (storage.foldername(storage.objects.name))[2] = c.id::text
    )
  )
);

-- 2. Organization assets: restrict uploads/updates to image files only
DROP POLICY IF EXISTS "Org admins can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can update assets" ON storage.objects;

CREATE POLICY "Org admins can upload branding images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-assets'
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','gif','webp','svg','ico')
  AND EXISTS (
    SELECT 1
    FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['org_admin'::app_role, 'super_admin'::app_role])
      AND (storage.foldername(name))[1] = om.organization_id::text
  )
);

CREATE POLICY "Org admins can update branding images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1
    FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['org_admin'::app_role, 'super_admin'::app_role])
      AND (storage.foldername(objects.name))[1] = om.organization_id::text
  )
)
WITH CHECK (
  bucket_id = 'organization-assets'
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','gif','webp','svg','ico')
  AND EXISTS (
    SELECT 1
    FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['org_admin'::app_role, 'super_admin'::app_role])
      AND (storage.foldername(name))[1] = om.organization_id::text
  )
);

-- 3. pbx_extensions: explicit INSERT/UPDATE/DELETE policies for org admins
CREATE POLICY "org_admins_insert_extensions"
ON public.pbx_extensions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "org_admins_update_extensions"
ON public.pbx_extensions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()));

CREATE POLICY "org_admins_delete_extensions"
ON public.pbx_extensions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR is_super_admin(auth.uid()));
