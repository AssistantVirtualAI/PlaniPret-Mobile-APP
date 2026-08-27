select cron.schedule(
  'pp-commission-live-sync-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-commission-live-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo',
      'x-pp-cron-secret', '800ae784eea654745ca6eb0151c1f900422239511a02532e14d7195aa2642536'
    ),
    body := jsonb_build_object('year_from', 2022)
  );
  $$
);