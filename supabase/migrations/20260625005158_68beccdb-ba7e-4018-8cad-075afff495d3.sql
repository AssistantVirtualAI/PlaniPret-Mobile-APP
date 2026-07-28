
-- Phase 1: voicemail greeting + AVA voice agent columns

ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS voicemail_greeting_text text,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_voice_id text,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_audio_url text,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS voicemail_greeting_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ava_sessions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ava_last_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS ava_preferred_lang text NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS ava_autonomy_mode text NOT NULL DEFAULT 'confirm';

ALTER TABLE public.planipret_profiles
  DROP CONSTRAINT IF EXISTS planipret_profiles_ava_autonomy_mode_check;
ALTER TABLE public.planipret_profiles
  ADD CONSTRAINT planipret_profiles_ava_autonomy_mode_check
  CHECK (ava_autonomy_mode IN ('confirm','semi_auto','full_auto'));

-- planipret_ava_conversations: extend
ALTER TABLE public.planipret_ava_conversations
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS tool_params jsonb,
  ADD COLUMN IF NOT EXISTS tool_result jsonb,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- message must allow NULL for tool rows
ALTER TABLE public.planipret_ava_conversations
  ALTER COLUMN message DROP NOT NULL;

-- relax role check to include 'tool'
ALTER TABLE public.planipret_ava_conversations
  DROP CONSTRAINT IF EXISTS planipret_ava_conversations_role_check;
ALTER TABLE public.planipret_ava_conversations
  ADD CONSTRAINT planipret_ava_conversations_role_check
  CHECK (role IN ('user','assistant','tool'));

CREATE INDEX IF NOT EXISTS idx_pp_ava_conv_session
  ON public.planipret_ava_conversations(session_id, created_at);
