
DROP VIEW IF EXISTS public.lemtel_config_safe;
CREATE VIEW public.lemtel_config_safe
  WITH (security_invoker = true) AS
  SELECT id, key, CASE WHEN is_secret THEN NULL ELSE value END as value, is_secret, updated_at
  FROM public.lemtel_config;
GRANT SELECT ON public.lemtel_config_safe TO authenticated;
