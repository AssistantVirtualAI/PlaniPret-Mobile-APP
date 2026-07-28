
-- 1) call-recordings bucket: add owner-scoped SELECT policy
CREATE POLICY "call_recordings_select_owner"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pbx_call_recordings rec
      WHERE (rec.storage_path = storage.objects.name OR rec.recording_path = storage.objects.name)
        AND (
          has_role(auth.uid(), rec.organization_id, 'org_admin'::app_role)
          OR has_role(auth.uid(), rec.organization_id, 'manager'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.pbx_call_records r
            WHERE r.id = rec.call_record_id
              AND is_my_extension_call(r.organization_id, r.extension, r.extension_uuid, r.caller_number, r.destination_number, r.destination, r.source_number)
          )
        )
    )
  )
);

-- 2) lemtel_config: restrict SELECT so secret rows require service_role
DROP POLICY IF EXISTS "lemtel admins read non-secret config" ON public.lemtel_config;
CREATE POLICY "lemtel admins read non-secret config"
ON public.lemtel_config
FOR SELECT
TO authenticated
USING (
  is_secret = false
  AND (is_lemtel_admin(auth.uid()) OR is_super_admin(auth.uid()))
);

-- 3) planipret_did_assignments: explicit admin write policies
CREATE POLICY "Planipret admins insert DID assignments"
ON public.planipret_did_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.planipret_profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
);

CREATE POLICY "Planipret admins update DID assignments"
ON public.planipret_did_assignments
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.planipret_profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.planipret_profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
);

CREATE POLICY "Planipret admins delete DID assignments"
ON public.planipret_did_assignments
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.planipret_profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')
);
