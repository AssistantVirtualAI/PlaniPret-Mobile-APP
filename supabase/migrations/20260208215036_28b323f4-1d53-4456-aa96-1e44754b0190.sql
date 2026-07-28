
-- Recreate agents_safe view to include slug and twilio_number columns
-- while still excluding the sensitive platform_api_key column
DROP VIEW IF EXISTS public.agents_safe;

CREATE VIEW public.agents_safe
WITH (security_invoker = true) AS
SELECT 
  id,
  organization_id,
  name,
  platform,
  platform_agent_id,
  description,
  avatar_url,
  widget_layout,
  branding_url,
  theme_config,
  config,
  is_external,
  assigned_to,
  client_id,
  slug,
  twilio_number,
  created_at,
  updated_at
FROM public.agents;
-- Note: platform_api_key is intentionally excluded for security
