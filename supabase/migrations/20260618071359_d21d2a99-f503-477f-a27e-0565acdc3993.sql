
-- 1) calendar_integrations: hide OAuth tokens from authenticated
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;
REVOKE INSERT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated;

-- 2) number_porting_requests: hide carrier PIN & account number from org members
REVOKE SELECT (pin, account_number) ON public.number_porting_requests FROM authenticated;
REVOKE UPDATE (pin, account_number) ON public.number_porting_requests FROM authenticated;

-- 3) organizations: hide api_key, stripe_customer_id, billing_email from org members
REVOKE SELECT (api_key, stripe_customer_id, billing_email) ON public.organizations FROM authenticated;
REVOKE UPDATE (api_key, stripe_customer_id) ON public.organizations FROM authenticated;

-- 4) lemtel_config: tighten "Admins manage lemtel_config" to Lemtel admins only
DROP POLICY IF EXISTS "Admins manage lemtel_config" ON public.lemtel_config;
CREATE POLICY "Lemtel admins manage lemtel_config"
  ON public.lemtel_config FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_lemtel_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_lemtel_admin(auth.uid()));
