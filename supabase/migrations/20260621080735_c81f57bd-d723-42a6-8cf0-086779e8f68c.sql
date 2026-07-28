ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ms365_access_token text,
  ADD COLUMN IF NOT EXISTS ms365_refresh_token text,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_id text;