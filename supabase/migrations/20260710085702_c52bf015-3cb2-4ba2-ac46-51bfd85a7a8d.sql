ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ava_voice_id text,
  ADD COLUMN IF NOT EXISTS ava_voice_stability numeric DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS ava_voice_similarity numeric DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS ava_voice_style numeric DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS ava_voice_speed numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS ava_chat_mode text NOT NULL DEFAULT 'chat';

ALTER TABLE public.planipret_profiles
  DROP CONSTRAINT IF EXISTS planipret_profiles_ava_chat_mode_check;
ALTER TABLE public.planipret_profiles
  ADD CONSTRAINT planipret_profiles_ava_chat_mode_check
  CHECK (ava_chat_mode IN ('chat','voice'));