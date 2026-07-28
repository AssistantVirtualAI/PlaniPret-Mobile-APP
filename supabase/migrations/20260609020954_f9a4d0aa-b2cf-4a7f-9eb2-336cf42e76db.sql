
-- 1. REVOKE credential columns on pbx_extensions from web roles
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;

-- 2. Belt-and-suspenders REVOKE on pbx_softphone_users credential columns
REVOKE SELECT (sip_password, sip_domain, wss_url) ON public.pbx_softphone_users FROM anon, authenticated;

-- 3. Allow softphone portal users to read their own call records (by extension match within their org)
DROP POLICY IF EXISTS "Softphone users can view own call records" ON public.pbx_call_records;
CREATE POLICY "Softphone users can view own call records"
ON public.pbx_call_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pbx_softphone_users s
    WHERE s.portal_user_id = auth.uid()
      AND s.organization_id = pbx_call_records.organization_id
      AND s.extension = pbx_call_records.extension
  )
);
