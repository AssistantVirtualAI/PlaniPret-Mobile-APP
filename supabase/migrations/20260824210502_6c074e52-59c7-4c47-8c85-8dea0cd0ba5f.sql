CREATE TABLE public.planipret_did_release_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  domain text NOT NULL,
  phone_number text NOT NULL,
  phone_number_e164 text,
  previous_extension text,
  previous_broker_name text,
  previous_broker_user_id uuid,
  reason text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  success boolean NOT NULL DEFAULT false,
  write_status integer,
  error_message text,
  triggered_by uuid,
  triggered_by_email text,
  source text NOT NULL DEFAULT 'admin_release',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_did_release_audit_job ON public.planipret_did_release_audit (job_id, created_at DESC);
CREATE INDEX idx_pp_did_release_audit_number ON public.planipret_did_release_audit (phone_number, created_at DESC);

GRANT SELECT ON public.planipret_did_release_audit TO authenticated;
GRANT ALL ON public.planipret_did_release_audit TO service_role;

ALTER TABLE public.planipret_did_release_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins can read DID release audit"
ON public.planipret_did_release_audit
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));