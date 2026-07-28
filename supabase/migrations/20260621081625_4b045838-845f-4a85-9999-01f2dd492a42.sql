ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ns_jwt text,
  ADD COLUMN IF NOT EXISTS ns_refresh_token text,
  ADD COLUMN IF NOT EXISTS ns_jwt_expires_at timestamptz;

ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS transcript text;