CREATE OR REPLACE FUNCTION public.enqueue_call_ai_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.has_recording, false) = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(NEW.has_recording, false) = true
         AND COALESCE(OLD.has_recording, false) = false)
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.pbx_ai_insights
      WHERE call_record_id = NEW.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pbx_ai_jobs
      WHERE call_record_id = NEW.id
        AND kind = 'process_recording'
        AND status IN ('pending','processing')
    )
    THEN
      INSERT INTO public.pbx_ai_jobs (organization_id, call_record_id, kind, status)
      VALUES (NEW.organization_id, NEW.id, 'process_recording', 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;