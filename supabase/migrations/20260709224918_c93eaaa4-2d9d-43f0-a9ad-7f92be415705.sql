ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS ai_topics jsonb,
  ADD COLUMN IF NOT EXISTS ai_action_items jsonb,
  ADD COLUMN IF NOT EXISTS transcript_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transcript_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcript_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pp_calls_transcript_pending
  ON public.planipret_phone_calls (transcript_pending, transcript_last_attempt_at)
  WHERE transcript_pending = true;