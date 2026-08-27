CREATE TABLE public.planipret_did_reconcile_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL DEFAULT 'planipret.ca',
  broker_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  orphan_ns_dids jsonb NOT NULL DEFAULT '[]'::jsonb,
  alert_sent boolean NOT NULL DEFAULT false,
  alert_error text,
  triggered_by text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.planipret_did_reconcile_reports TO authenticated;
GRANT ALL ON public.planipret_did_reconcile_reports TO service_role;

ALTER TABLE public.planipret_did_reconcile_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins read DID reconcile reports"
ON public.planipret_did_reconcile_reports
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE INDEX idx_pp_did_reconcile_reports_created_at ON public.planipret_did_reconcile_reports (created_at DESC);