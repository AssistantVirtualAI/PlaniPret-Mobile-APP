CREATE TABLE IF NOT EXISTS public.planipret_portal_login_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  email text,
  user_id uuid,
  portal text NOT NULL DEFAULT 'unknown',
  outcome text NOT NULL DEFAULT 'failure',
  reason text,
  provider text DEFAULT 'microsoft',
  path text,
  user_agent text,
  ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pp_portal_login_audit_time_idx ON public.planipret_portal_login_audit (occurred_at DESC);
CREATE INDEX IF NOT EXISTS pp_portal_login_audit_email_idx ON public.planipret_portal_login_audit (lower(email));

GRANT SELECT ON public.planipret_portal_login_audit TO authenticated;
GRANT ALL ON public.planipret_portal_login_audit TO service_role;

ALTER TABLE public.planipret_portal_login_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_portal_login_audit_admin_read ON public.planipret_portal_login_audit;
CREATE POLICY pp_portal_login_audit_admin_read
ON public.planipret_portal_login_audit
FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));