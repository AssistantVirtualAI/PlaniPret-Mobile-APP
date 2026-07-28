
-- 1) leads: require org membership in addition to role check
DROP POLICY IF EXISTS "Role-based lead access" ON public.leads;
DROP POLICY IF EXISTS "Managers can create organization leads" ON public.leads;
DROP POLICY IF EXISTS "Managers can update organization leads" ON public.leads;
DROP POLICY IF EXISTS "Managers can delete organization leads" ON public.leads;

CREATE POLICY "Role-based lead access" ON public.leads
FOR SELECT USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.organization_members om
            WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id)
    AND (has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  )
);

CREATE POLICY "Managers can create organization leads" ON public.leads
FOR INSERT WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.organization_members om
            WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id)
    AND (has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  )
);

CREATE POLICY "Managers can update organization leads" ON public.leads
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.organization_members om
            WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id)
    AND (has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  )
);

CREATE POLICY "Managers can delete organization leads" ON public.leads
FOR DELETE USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.organization_members om
            WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id)
    AND (has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  )
);

-- 2) Lemtel recordings: enforce strict domain_uuid/customer_id/... path convention
DROP POLICY IF EXISTS "lemtel_recordings_scoped_select" ON storage.objects;
DROP POLICY IF EXISTS "Portal users can read own recordings" ON storage.objects;

CREATE POLICY "lemtel_recordings_scoped_select" ON storage.objects
FOR SELECT USING (
  bucket_id = 'lemtel-recordings'
  AND (
    is_lemtel_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.portal_user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = c.domain_uuid
        AND (storage.foldername(objects.name))[2] = (c.id)::text
    )
  )
);

DROP POLICY IF EXISTS "lemtel recordings strict path on write" ON storage.objects;
CREATE POLICY "lemtel recordings strict path on write" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id <> 'lemtel-recordings'
  OR (
    is_lemtel_admin(auth.uid())
    AND (storage.foldername(objects.name))[1] IS NOT NULL
    AND (storage.foldername(objects.name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.domain_uuid = (storage.foldername(objects.name))[1]
        AND (c.id)::text = (storage.foldername(objects.name))[2]
    )
  )
);

-- 3) organization-assets: restrict uploads to image files only (branding assets)
DROP POLICY IF EXISTS "organization-assets image-only insert" ON storage.objects;
CREATE POLICY "organization-assets image-only insert" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id <> 'organization-assets'
  OR COALESCE((metadata->>'mimetype'), '') LIKE 'image/%'
);
