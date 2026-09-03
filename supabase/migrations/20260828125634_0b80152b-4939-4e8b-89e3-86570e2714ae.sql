select cron.schedule(
  'pp-pbx-action-queue-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-pbx-action-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo'
    ),
    body := jsonb_build_object('action', 'process')
  );
  $$
);

create index if not exists idx_pp_proxy_health_created on public.planipret_proxy_health (created_at desc);
create index if not exists idx_pp_ai_usage_created on public.planipret_ai_provider_usage (created_at desc);
create index if not exists idx_pp_pbx_queue_due on public.planipret_pbx_action_queue (status, next_attempt_at);
