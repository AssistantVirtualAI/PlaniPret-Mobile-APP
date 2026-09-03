update planipret_integration_secrets
set config = jsonb_set(config::jsonb, '{api_key}', '"ad104864e830b4d2294e1b082e116054d8875b9aea1ff5fd88891922dfab25e6e"'::jsonb, true)
where provider = 'maestro_telecom';