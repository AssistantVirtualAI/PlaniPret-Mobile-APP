
-- Revoke column-level SELECT on sensitive credential columns from anon/authenticated.
-- Service role retains full access for edge functions.

REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM anon, authenticated;
REVOKE SELECT (api_key) ON public.organization_integrations FROM anon, authenticated;
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM anon, authenticated;
REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM anon, authenticated;
REVOKE SELECT (username, from_user, realm, config) ON public.pbx_gateways FROM anon, authenticated;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;

-- Stricter org-membership function used for realtime channel authorization.
-- Excludes pbx_softphone_users portal-user mappings so portal customers cannot
-- subscribe to internal org channels.
CREATE OR REPLACE FUNCTION public.current_user_internal_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  UNION
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
$$;

-- Tighten realtime policy to use internal-org membership only.
DROP POLICY IF EXISTS "auth org members realtime read" ON realtime.messages;
CREATE POLICY "auth org members realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic())::uuid IN (SELECT public.current_user_internal_org_ids())
);
