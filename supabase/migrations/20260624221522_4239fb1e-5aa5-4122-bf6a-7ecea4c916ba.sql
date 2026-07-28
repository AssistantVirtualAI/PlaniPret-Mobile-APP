
-- 1. lemtel_softphone_users.sip_password
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;

-- 2. pbx_app_provision_queue.sip_password and sip_domain
REVOKE SELECT (sip_password, sip_domain) ON public.pbx_app_provision_queue FROM authenticated, anon;

-- 3. organizations.stripe_customer_id and billing_email
REVOKE SELECT (stripe_customer_id, billing_email) ON public.organizations FROM authenticated, anon;

-- 4. planipret_integration_secrets.config
REVOKE SELECT (config) ON public.planipret_integration_secrets FROM authenticated, anon;
-- Ensure RLS is enabled and no permissive SELECT policy exists for non-service callers
ALTER TABLE public.planipret_integration_secrets ENABLE ROW LEVEL SECURITY;
