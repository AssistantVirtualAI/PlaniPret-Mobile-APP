ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ava_voice_model text,
  ADD COLUMN IF NOT EXISTS ava_voice_speaker_boost boolean NOT NULL DEFAULT true;