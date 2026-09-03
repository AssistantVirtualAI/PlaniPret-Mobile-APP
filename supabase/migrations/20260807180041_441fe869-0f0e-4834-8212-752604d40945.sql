update planipret_integration_secrets
set config = config::jsonb
  || jsonb_build_object(
    'api_url', 'https://client-dev.planipret.com/telecom/api/v1',
    'api_key', 'f6b1afc243cadac3bda865beddd2e5bf0a19b7cd806b1ad1eac1c0039970fe20'
  )
where provider = 'maestro_telecom';