-- Create safe view for clients table (excludes password_hash, password_reset_token, password_reset_expires_at)
CREATE OR REPLACE VIEW public.clients_safe
WITH (security_invoker = true) AS
SELECT 
  id,
  name,
  email,
  username,
  login_id,
  language,
  theme,
  status,
  custom_css,
  access_controls,
  organization_id,
  assigned_agent_id,
  assigned_agents,
  user_id,
  created_by,
  created_at,
  updated_at,
  (password_hash IS NOT NULL) as has_password
FROM public.clients;

-- Create safe view for client_members table (excludes password_hash, password_reset_token, password_reset_expires_at)
CREATE OR REPLACE VIEW public.client_members_safe
WITH (security_invoker = true) AS
SELECT 
  id,
  client_id,
  email,
  name,
  login_id,
  role,
  status,
  last_login_at,
  created_at,
  (password_hash IS NOT NULL) as has_password
FROM public.client_members;

-- Grant SELECT on the safe views to authenticated users
GRANT SELECT ON public.clients_safe TO authenticated;
GRANT SELECT ON public.client_members_safe TO authenticated;