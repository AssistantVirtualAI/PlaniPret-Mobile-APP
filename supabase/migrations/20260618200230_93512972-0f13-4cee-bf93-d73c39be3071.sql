
-- Unique insight per recording
CREATE UNIQUE INDEX IF NOT EXISTS pbx_ai_insights_call_record_id_uniq
  ON public.pbx_ai_insights(call_record_id);

-- Audit trail
CREATE TABLE IF NOT EXISTS public.call_intelligence_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  call_record_id uuid NOT NULL,
  event text NOT NULL,                  -- queued | processing | transcribed | analyzed | skipped_cached | failed | locked_busy
  status text NOT NULL,                 -- queued | processing | analyzed | failed | skipped
  pipeline text,                        -- transcribe | analyze | full
  ai_model text,
  prompt_version text,
  forced boolean NOT NULL DEFAULT false,
  triggered_by uuid,
  duration_ms integer,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_intel_audit_call_idx
  ON public.call_intelligence_audit(call_record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_intel_audit_org_idx
  ON public.call_intelligence_audit(organization_id, created_at DESC);

GRANT SELECT ON public.call_intelligence_audit TO authenticated;
GRANT ALL ON public.call_intelligence_audit TO service_role;

ALTER TABLE public.call_intelligence_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org audit"
  ON public.call_intelligence_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = call_intelligence_audit.organization_id
        AND om.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Concurrency helpers (uuid-keyed advisory lock via hashtext)
CREATE OR REPLACE FUNCTION public.try_lock_call_intel(_call_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtextextended('call-intel:' || _call_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.unlock_call_intel(_call_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtextextended('call-intel:' || _call_id::text, 0));
$$;

GRANT EXECUTE ON FUNCTION public.try_lock_call_intel(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_call_intel(uuid) TO service_role;
