-- Restrict end-user desktop/mobile access to the call records of their own softphone extension.
-- Admin portal workflows that use service_role remain unaffected.

ALTER TABLE public.pbx_call_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Softphone users can read own call records" ON public.pbx_call_records;
DROP POLICY IF EXISTS "Org admins can read organization call records" ON public.pbx_call_records;

CREATE POLICY "Softphone users can read own call records"
ON public.pbx_call_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pbx_softphone_users s
    WHERE s.portal_user_id = auth.uid()
      AND s.organization_id = pbx_call_records.organization_id
      AND (
        (s.extension_uuid IS NOT NULL AND pbx_call_records.extension_uuid = s.extension_uuid)
        OR (s.extension_uuid IS NULL AND s.extension IS NOT NULL AND pbx_call_records.extension = s.extension)
      )
  )
);

CREATE POLICY "Org admins can read organization call records"
ON public.pbx_call_records
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = pbx_call_records.organization_id
      AND om.role IN ('owner', 'admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_pbx_call_records_softphone_scope
  ON public.pbx_call_records (organization_id, extension_uuid, extension, start_at DESC);
