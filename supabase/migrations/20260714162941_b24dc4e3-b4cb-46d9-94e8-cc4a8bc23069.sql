DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.planipret_phone_calls
    WHERE COALESCE(duration_seconds, 0) >= 5
      AND (
        recording_url IS NOT NULL
        OR ns_call_id IS NOT NULL
        OR ns_callid IS NOT NULL
        OR ns_cdr_id IS NOT NULL
        OR ns_orig_callid IS NOT NULL
        OR COALESCE(has_recording, false) = true
      )
      AND (
        transcript IS NULL
        OR analyzed_at IS NULL
        OR ai_summary IS NULL
        OR ai_coaching IS NULL
        OR coaching_score IS NULL
      )
    ORDER BY started_at DESC NULLS LAST
    LIMIT 1000
  LOOP
    PERFORM net.http_post(
      url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-auto-process-call',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo'
      ),
      body := jsonb_build_object('call_id', r.id)
    );
  END LOOP;
END $$;