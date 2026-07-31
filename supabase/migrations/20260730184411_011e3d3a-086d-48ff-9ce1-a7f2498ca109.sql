SELECT cron.unschedule('pp-did-guardian-2h') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pp-did-guardian-2h');
SELECT cron.unschedule('pp-did-guardian-snapshot-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pp-did-guardian-snapshot-daily');

SELECT cron.schedule(
  'pp-did-guardian-2h',
  '7 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-did-guardian',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','ncuOl-PyCGfZkcNnKa1nZASSbra8ibxlcvzMNSLPHbaTafsnK3VUq31VNLo2VyJK'),
    body := jsonb_build_object('action','repair','offset', o, 'limit', 50)
  )
  FROM generate_series(0, 400, 50) AS o;
  $$
);

SELECT cron.schedule(
  'pp-did-guardian-snapshot-daily',
  '35 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-did-guardian',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','ncuOl-PyCGfZkcNnKa1nZASSbra8ibxlcvzMNSLPHbaTafsnK3VUq31VNLo2VyJK'),
    body := jsonb_build_object('action','snapshot','offset', o, 'limit', 50)
  )
  FROM generate_series(0, 400, 50) AS o;
  $$
);