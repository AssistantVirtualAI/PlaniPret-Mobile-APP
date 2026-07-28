
-- Revoke sensitive columns
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.billing_config FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM anon, authenticated;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM anon, authenticated;
REVOKE SELECT (ms365_access_token, ms365_refresh_token, ns_jwt, ns_refresh_token, maestro_broker_token, elevenlabs_agent_id) ON public.planipret_profiles FROM anon, authenticated;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;

-- Restrict org membership helpers to exclude softphone-derived org IDs
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  UNION
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id
  UNION
  SELECT org_id FROM public.org_members WHERE user_id = _user_id
$function$;
