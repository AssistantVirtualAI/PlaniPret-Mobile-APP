-- Keep recently viewed paid and pending commission reports warm. The reports
-- remain scoped and authorize every read; this job only refreshes snapshots
-- created by a prior authorized view. The service key stays in Vault.
CREATE OR REPLACE FUNCTION public.pp_warm_commission_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  _service_key text;
BEGIN
  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;
  IF _service_key IS NULL OR length(trim(_service_key)) = 0 THEN
    RAISE WARNING 'pp_warm_commission_snapshots: service role key is not configured';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/planipret-commission-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object('action', 'warm_snapshots')
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pp_warm_commission_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pp_warm_commission_snapshots() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('pp-commission-snapshot-warm-15min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pp-commission-snapshot-warm-15min');
    PERFORM cron.schedule(
      'pp-commission-snapshot-warm-15min',
      '*/15 * * * *',
      'SELECT public.pp_warm_commission_snapshots();'
    );
  END IF;
END $$;
