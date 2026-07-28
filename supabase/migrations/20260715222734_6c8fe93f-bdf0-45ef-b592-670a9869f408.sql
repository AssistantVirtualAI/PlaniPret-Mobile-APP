ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS maestro_telecom_user_id TEXT,
  ADD COLUMN IF NOT EXISTS maestro_telecom_email TEXT,
  ADD COLUMN IF NOT EXISTS maestro_telecom_linked_at TIMESTAMPTZ;