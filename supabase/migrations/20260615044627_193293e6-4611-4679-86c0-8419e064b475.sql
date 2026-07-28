DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 2) THEN
    PERFORM cron.unschedule(2);
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 3) THEN
    PERFORM cron.unschedule(3);
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 23) THEN
    PERFORM cron.unschedule(23);
  END IF;
END $$;

SELECT cron.schedule(
  'pbx-recent-sync-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/cron-pbx-sync',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pbx_call_recordings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_recordings;
  END IF;
END $$;