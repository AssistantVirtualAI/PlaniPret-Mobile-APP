
CREATE TABLE IF NOT EXISTS public.pbx_wss_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  url TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_wss_health_checks_checked_at_idx
  ON public.pbx_wss_health_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS pbx_wss_health_checks_host_port_idx
  ON public.pbx_wss_health_checks (host, port, checked_at DESC);

GRANT SELECT ON public.pbx_wss_health_checks TO authenticated;
GRANT ALL ON public.pbx_wss_health_checks TO service_role;

ALTER TABLE public.pbx_wss_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can read wss health checks" ON public.pbx_wss_health_checks;
CREATE POLICY "Super admins can read wss health checks"
  ON public.pbx_wss_health_checks
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
