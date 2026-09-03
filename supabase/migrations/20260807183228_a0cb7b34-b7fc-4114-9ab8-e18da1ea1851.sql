-- Update Maestro Telecom production domain from the old courtier.planipret.com
-- to the canonical production domain client.planipret.com.
-- Staging remains client-dev.planipret.com and is not touched by this migration.
UPDATE public.planipret_integration_secrets
SET config = config::jsonb || jsonb_build_object(
  'api_url', 'https://client.planipret.com/telecom/api/v1'
)
WHERE provider = 'maestro_telecom'
  AND (config->>'api_url') LIKE '%courtier.planipret.com%';