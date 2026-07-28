
-- organization_integrations.api_key
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;

-- pbx_extensions credentials
REVOKE SELECT (password, voicemail_password) ON public.pbx_extensions FROM authenticated, anon;

-- planipret_profiles tokens
REVOKE SELECT (ns_jwt, ns_refresh_token, ms365_access_token, ms365_refresh_token, maestro_broker_token)
  ON public.planipret_profiles FROM authenticated, anon;

-- webhook_endpoints.secret
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

-- pbx_domain_users.api_key
REVOKE SELECT (api_key) ON public.pbx_domain_users FROM authenticated, anon;

-- pbx_gateways credential-bearing columns
REVOKE SELECT (username, realm, proxy, from_user, config)
  ON public.pbx_gateways FROM authenticated, anon;

-- pbx_voicemail_settings.pin_hash
REVOKE SELECT (pin_hash) ON public.pbx_voicemail_settings FROM authenticated, anon;

-- lemtel_config: split the ALL policy so SELECT is restricted to non-secret rows
DROP POLICY IF EXISTS "Lemtel admins manage lemtel_config" ON public.lemtel_config;

CREATE POLICY "Lemtel admins insert lemtel_config"
  ON public.lemtel_config FOR INSERT TO authenticated
  WITH CHECK (public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Lemtel admins update lemtel_config"
  ON public.lemtel_config FOR UPDATE TO authenticated
  USING (public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Lemtel admins delete lemtel_config"
  ON public.lemtel_config FOR DELETE TO authenticated
  USING (public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
