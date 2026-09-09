-- lovable-cron-fallback-reviewed: 48 runs/day; reconciliation backstop for NetSapiens call/recording/message webhooks that silently stopped delivering; provider has no replay API
select cron.schedule(
  'pp-ns-sync-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-admin-ns-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);