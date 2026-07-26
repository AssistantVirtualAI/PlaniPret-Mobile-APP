ALTER TABLE public.planipret_integration_secrets
  DROP CONSTRAINT IF EXISTS planipret_integration_secrets_provider_check;

ALTER TABLE public.planipret_integration_secrets
  ADD CONSTRAINT planipret_integration_secrets_provider_check
  CHECK (provider = ANY (ARRAY[
    'microsoft'::text,
    'maestro'::text,
    'maestro_telecom'::text,
    'maestro_oauth'::text,
    'maestro_oauth_pending'::text,
    'maestro_oauth_error'::text
  ]));