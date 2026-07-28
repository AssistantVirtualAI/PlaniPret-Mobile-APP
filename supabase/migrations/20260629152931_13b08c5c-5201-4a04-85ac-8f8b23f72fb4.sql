-- Idempotence: one transcript per call
CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_transcripts_call_record_id_uniq
  ON public.pbx_call_transcripts (call_record_id);

-- Realtime broadcast for transcripts
ALTER TABLE public.pbx_call_transcripts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pbx_call_transcripts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_transcripts';
  END IF;
END $$;