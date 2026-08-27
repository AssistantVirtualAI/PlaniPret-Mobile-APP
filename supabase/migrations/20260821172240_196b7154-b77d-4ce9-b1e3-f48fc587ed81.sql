CREATE TABLE public.planipret_portal_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event text NOT NULL,
  reason text,
  provider text,
  portal text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_access_log_created ON public.planipret_portal_access_log (created_at DESC);
CREATE INDEX idx_pp_access_log_user ON public.planipret_portal_access_log (user_id, created_at DESC);
CREATE INDEX idx_pp_access_log_event ON public.planipret_portal_access_log (event, created_at DESC);

GRANT SELECT ON public.planipret_portal_access_log TO authenticated;
GRANT ALL ON public.planipret_portal_access_log TO service_role;

ALTER TABLE public.planipret_portal_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins read access log"
ON public.planipret_portal_access_log
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));