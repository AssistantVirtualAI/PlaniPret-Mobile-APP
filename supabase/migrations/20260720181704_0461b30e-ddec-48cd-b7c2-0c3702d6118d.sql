ALTER TABLE planipret_maestro_oauth_states ADD COLUMN IF NOT EXISTS code_verifier TEXT;
ALTER TABLE planipret_profiles ADD COLUMN IF NOT EXISTS maestro_oauth_client TEXT DEFAULT 'web';