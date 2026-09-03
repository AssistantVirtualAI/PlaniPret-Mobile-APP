UPDATE public.planipret_integration_secrets
SET config = jsonb_set(config::jsonb, '{api_url}', '"https://courtier.planipret.com/telecom/api/v1"')
WHERE provider = 'maestro_telecom';