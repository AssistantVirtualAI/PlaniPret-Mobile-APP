DROP TRIGGER IF EXISTS trg_pp_auto_process_call ON public.planipret_phone_calls;

ALTER TABLE public.planipret_phone_calls DROP COLUMN has_recording;
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN has_recording boolean
  GENERATED ALWAYS AS (
    (recording_url IS NOT NULL AND recording_url <> '')
    OR (ns_recording_url IS NOT NULL AND ns_recording_url <> '')
    OR (recording_storage_path IS NOT NULL AND recording_storage_path <> '')
  ) STORED;

CREATE TRIGGER trg_pp_auto_process_call
AFTER INSERT OR UPDATE OF recording_url, transcript, ns_call_id, ns_callid, ns_cdr_id, ns_orig_callid, has_recording
ON public.planipret_phone_calls
FOR EACH ROW EXECUTE FUNCTION public.pp_trigger_auto_process_call();