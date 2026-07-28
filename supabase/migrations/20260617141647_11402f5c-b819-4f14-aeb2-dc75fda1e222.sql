CREATE TABLE IF NOT EXISTS public.ai_request_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  user_id UUID,
  call_record_id TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('transcribe','analyze','period-insight','rewrite','summary','other')),
  status TEXT NOT NULL CHECK (status IN ('ok','no-audio','no-transcript','missing-key','ai-error','forbidden','bad-request','timeout','error')),
  error_code TEXT,
  http_status INTEGER,
  message TEXT,
  provider TEXT,
  model TEXT,
  latency_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_request_audit_log TO authenticated;
GRANT ALL ON public.ai_request_audit_log TO service_role;

ALTER TABLE public.ai_request_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their org AI audit"
ON public.ai_request_audit_log FOR SELECT TO authenticated
USING (
  organization_id IS NULL
  OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.organization_id = ai_request_audit_log.organization_id)
  OR EXISTS (SELECT 1 FROM public.org_members om2 WHERE om2.user_id = auth.uid() AND om2.org_id = ai_request_audit_log.organization_id)
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','org_admin'))
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON public.ai_request_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_org ON public.ai_request_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_call ON public.ai_request_audit_log (call_record_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_status ON public.ai_request_audit_log (status, created_at DESC);