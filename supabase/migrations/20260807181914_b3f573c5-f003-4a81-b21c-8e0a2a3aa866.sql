UPDATE public.planipret_integration_secrets
SET config = config::jsonb || jsonb_build_object(
  'api_url', 'https://courtier.planipret.com/telecom/api/v1',
  'api_key', 'ad104864e830b4d2294e1b082e116054d8875b9aea1ff5fd88891922dfab25e6e'
)
WHERE provider = 'maestro_telecom';