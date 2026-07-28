
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;

REVOKE SELECT (api_key, stripe_customer_id, fusionpbx_server_url, fusionpbx_domain_name, fusionpbx_domain_uuid)
  ON public.organizations FROM authenticated, anon;

REVOKE SELECT (username, from_user, realm, proxy, config)
  ON public.pbx_gateways FROM authenticated, anon;

REVOKE SELECT (sip_domain, wss_url) ON public.pbx_softphone_users FROM authenticated, anon;

DROP POLICY IF EXISTS "lemtel admins manage config" ON public.lemtel_config;
CREATE POLICY "lemtel admins read non-secret config"
  ON public.lemtel_config FOR SELECT TO authenticated
  USING (is_lemtel_admin(auth.uid()) AND (is_secret = false OR is_super_admin(auth.uid())));
CREATE POLICY "lemtel admins write config"
  ON public.lemtel_config FOR INSERT TO authenticated
  WITH CHECK (is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins update config"
  ON public.lemtel_config FOR UPDATE TO authenticated
  USING (is_lemtel_admin(auth.uid())) WITH CHECK (is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins delete config"
  ON public.lemtel_config FOR DELETE TO authenticated
  USING (is_lemtel_admin(auth.uid()));

DROP POLICY IF EXISTS "members delete voice_agent_assignments" ON public.voice_agent_assignments;
CREATE POLICY "admins delete voice_agent_assignments"
  ON public.voice_agent_assignments FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "members update voice_agent_clients" ON public.voice_agent_clients;
CREATE POLICY "admins update voice_agent_clients"
  ON public.voice_agent_clients FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR is_super_admin(auth.uid())
  );

ALTER PUBLICATION supabase_realtime DROP TABLE public.pbx_gateways;
ALTER PUBLICATION supabase_realtime DROP TABLE public.pbx_sip_profiles;
