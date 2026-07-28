
-- Tighten RLS on call_intelligence_audit (align with pbx_ai_insights)
DROP POLICY IF EXISTS "Members can view their org audit" ON public.call_intelligence_audit;

CREATE POLICY "Org members can view audit"
  ON public.call_intelligence_audit FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- Idempotency key
ALTER TABLE public.call_intelligence_audit
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS call_intel_audit_idem_idx
  ON public.call_intelligence_audit(idempotency_key);

-- Pipeline stats view (security_invoker so RLS applies)
CREATE OR REPLACE VIEW public.call_intel_pipeline_stats
WITH (security_invoker = true) AS
SELECT
  organization_id,
  date_trunc('day', created_at) AS day,
  status,
  count(*)::bigint AS count
FROM public.call_intelligence_audit
GROUP BY organization_id, date_trunc('day', created_at), status;

GRANT SELECT ON public.call_intel_pipeline_stats TO authenticated;

CREATE OR REPLACE VIEW public.call_intel_failure_reasons
WITH (security_invoker = true) AS
SELECT
  organization_id,
  date_trunc('day', created_at) AS day,
  coalesce(nullif(error, ''), 'unknown') AS error,
  pipeline,
  count(*)::bigint AS count
FROM public.call_intelligence_audit
WHERE status = 'failed'
GROUP BY organization_id, date_trunc('day', created_at), error, pipeline;

GRANT SELECT ON public.call_intel_failure_reasons TO authenticated;

-- Auto-enqueue trigger: when a call gets a recording, queue an AI job
CREATE OR REPLACE FUNCTION public.enqueue_call_ai_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- only when has_recording flips to true (or set true on insert) and no insight yet
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.has_recording, false) = true)
     OR (TG_OP = 'UPDATE' AND COALESCE(NEW.has_recording, false) = true
         AND COALESCE(OLD.has_recording, false) = false)
  THEN
    IF NOT EXISTS (SELECT 1 FROM public.pbx_ai_insights WHERE call_record_id = NEW.id)
       AND NOT EXISTS (SELECT 1 FROM public.pbx_ai_jobs
                       WHERE call_record_id = NEW.id
                         AND job_type = 'process_recording'
                         AND status IN ('pending','processing'))
    THEN
      INSERT INTO public.pbx_ai_jobs (organization_id, call_record_id, job_type, status)
      VALUES (NEW.organization_id, NEW.id, 'process_recording', 'pending');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_call_ai_job ON public.pbx_call_records;
CREATE TRIGGER trg_enqueue_call_ai_job
AFTER INSERT OR UPDATE OF has_recording ON public.pbx_call_records
FOR EACH ROW EXECUTE FUNCTION public.enqueue_call_ai_job();
