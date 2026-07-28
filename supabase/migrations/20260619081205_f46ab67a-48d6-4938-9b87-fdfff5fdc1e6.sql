-- Backfill domain_uuid on pbx_softphone_users from organizations.fusionpbx_domain_uuid
UPDATE public.pbx_softphone_users s
SET domain_uuid = o.fusionpbx_domain_uuid
FROM public.organizations o
WHERE s.organization_id = o.id
  AND s.domain_uuid IS NULL
  AND o.fusionpbx_domain_uuid IS NOT NULL;

-- Create a safe directory view exposing only non-sensitive extension fields
CREATE OR REPLACE VIEW public.pbx_extensions_directory
WITH (security_invoker=on) AS
SELECT
  id,
  organization_id,
  domain_uuid,
  extension,
  effective_cid_name AS display_name,
  description,
  enabled,
  portal_user_id,
  extension_type,
  last_pbx_seen_at
FROM public.pbx_extensions;

GRANT SELECT ON public.pbx_extensions_directory TO authenticated;
GRANT SELECT ON public.pbx_extensions_directory TO service_role;