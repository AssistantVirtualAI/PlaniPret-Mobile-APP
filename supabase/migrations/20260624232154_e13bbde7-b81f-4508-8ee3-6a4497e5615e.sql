
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS maestro_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maestro_call_id text,
  ADD COLUMN IF NOT EXISTS maestro_client_id text,
  ADD COLUMN IF NOT EXISTS transcript_segments jsonb,
  ADD COLUMN IF NOT EXISTS transcript_language text DEFAULT 'fr-CA',
  ADD COLUMN IF NOT EXISTS ai_coaching jsonb,
  ADD COLUMN IF NOT EXISTS ai_key_points jsonb,
  ADD COLUMN IF NOT EXISTS ai_client_insights jsonb,
  ADD COLUMN IF NOT EXISTS lead_score int,
  ADD COLUMN IF NOT EXISTS lead_temperature text,
  ADD COLUMN IF NOT EXISTS lead_score_reason text,
  ADD COLUMN IF NOT EXISTS pipeline_state jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS maestro_broker_token text,
  ADD COLUMN IF NOT EXISTS maestro_broker_id text,
  ADD COLUMN IF NOT EXISTS maestro_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pp_calls_maestro_client
  ON public.planipret_phone_calls (maestro_client_id)
  WHERE maestro_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pp_calls_pipeline_recent
  ON public.planipret_phone_calls (user_id, created_at DESC)
  WHERE recording_url IS NOT NULL OR transcript IS NOT NULL OR ai_summary IS NOT NULL;

-- Enable Realtime for live pipeline UI updates (no-op if already member)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'planipret_phone_calls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_phone_calls';
  END IF;
END $$;
