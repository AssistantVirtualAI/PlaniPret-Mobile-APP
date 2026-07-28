CREATE OR REPLACE FUNCTION public.pp_trigger_auto_process_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.analyzed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.duration_seconds, 0) < 5 THEN RETURN NEW; END IF;

  -- Any way to fetch media from NS (recording_url is often populated late)
  IF NEW.recording_url IS NULL
     AND NEW.ns_call_id IS NULL
     AND NEW.ns_cdr_id IS NULL
     AND NEW.ns_orig_callid IS NULL
     AND COALESCE(NEW.has_recording, false) = false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.recording_url IS NOT DISTINCT FROM NEW.recording_url
     AND OLD.transcript IS NOT DISTINCT FROM NEW.transcript
     AND OLD.ns_call_id IS NOT DISTINCT FROM NEW.ns_call_id
     AND OLD.ns_cdr_id IS NOT DISTINCT FROM NEW.ns_cdr_id
     AND OLD.ns_orig_callid IS NOT DISTINCT FROM NEW.ns_orig_callid
     AND OLD.has_recording IS NOT DISTINCT FROM NEW.has_recording THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-auto-process-call',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo'
    ),
    body := jsonb_build_object('call_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;