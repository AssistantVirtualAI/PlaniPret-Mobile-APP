
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS transcript_raw text,
  ADD COLUMN IF NOT EXISTS transcript_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS coaching_score numeric,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_in_progress boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS analysis_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_locked_by text,
  ADD COLUMN IF NOT EXISTS ns_cdr_id text,
  ADD COLUMN IF NOT EXISTS ns_recording_url text;

CREATE INDEX IF NOT EXISTS idx_planipret_calls_ns_callid ON public.planipret_phone_calls(ns_callid);
CREATE INDEX IF NOT EXISTS idx_planipret_calls_analyzed_at ON public.planipret_phone_calls(analyzed_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'planipret_phone_calls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_phone_calls';
  END IF;
END $$;

ALTER TABLE public.planipret_phone_calls REPLICA IDENTITY FULL;
