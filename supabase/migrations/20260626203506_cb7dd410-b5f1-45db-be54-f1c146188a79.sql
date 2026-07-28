
-- pbx_gateways: hide credential-bearing columns
REVOKE SELECT, UPDATE ON public.pbx_gateways FROM authenticated, anon;
GRANT SELECT (id, organization_id, pbx_uuid, name, expire_seconds, register, context, profile, status, enabled, pbx_etag, last_synced_at, created_at, updated_at) ON public.pbx_gateways TO authenticated;
GRANT UPDATE (name, expire_seconds, register, context, profile, status, enabled, updated_at) ON public.pbx_gateways TO authenticated;

-- pbx_integrations: hide config
REVOKE SELECT, UPDATE ON public.pbx_integrations FROM authenticated, anon;
GRANT SELECT (id, organization_id, provider, base_url, domain, status, last_sync_at, created_at, updated_at) ON public.pbx_integrations TO authenticated;
GRANT UPDATE (base_url, domain, status, last_sync_at, updated_at) ON public.pbx_integrations TO authenticated;
