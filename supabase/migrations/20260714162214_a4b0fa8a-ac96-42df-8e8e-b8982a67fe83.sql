CREATE OR REPLACE FUNCTION public.pp_trigger_auto_process_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.analyzed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.duration_seconds, 0) < 5 THEN RETURN NEW; END IF;

  -- Any way to fetch media/transcript from NetSapiens. ns_callid is the real
  -- parent call-id used by the recordings/transcriptions endpoints; ns_call_id
  -- is often only our synthetic local key.
  IF NEW.recording_url IS NULL
     AND NEW.ns_call_id IS NULL
     AND NEW.ns_callid IS NULL
     AND NEW.ns_cdr_id IS NULL
     AND NEW.ns_orig_callid IS NULL
     AND COALESCE(NEW.has_recording, false) = false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.recording_url IS NOT DISTINCT FROM NEW.recording_url
     AND OLD.transcript IS NOT DISTINCT FROM NEW.transcript
     AND OLD.ns_call_id IS NOT DISTINCT FROM NEW.ns_call_id
     AND OLD.ns_callid IS NOT DISTINCT FROM NEW.ns_callid
     AND OLD.ns_cdr_id IS NOT DISTINCT FROM NEW.ns_cdr_id
     AND OLD.ns_orig_callid IS NOT DISTINCT FROM NEW.ns_orig_callid
     AND OLD.has_recording IS NOT DISTINCT FROM NEW.has_recording THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-auto-process-call',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiOiJnZWp4aXNycXR2eGF2YnJmY294eiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzYxNTAzMTc0LCJleHAiOjIwNzcwNzkxNzR9.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo'
    ),
    body := jsonb_build_object('call_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pp_auto_process_call ON public.planipret_phone_calls;
CREATE TRIGGER trg_pp_auto_process_call
AFTER INSERT OR UPDATE OF recording_url, transcript, ns_call_id, ns_callid, ns_cdr_id, ns_orig_callid, has_recording
ON public.planipret_phone_calls
FOR EACH ROW
EXECUTE FUNCTION public.pp_trigger_auto_process_call();