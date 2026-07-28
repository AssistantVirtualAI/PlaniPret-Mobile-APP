-- 1. Hide plaintext SIP passwords from client roles (column-level revoke)
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM anon;

-- 2. Restrict porting request reads (account numbers / PINs) to admins
DROP POLICY IF EXISTS "org members read porting" ON public.number_porting_requests;
CREATE POLICY "org admins read porting"
ON public.number_porting_requests
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
);