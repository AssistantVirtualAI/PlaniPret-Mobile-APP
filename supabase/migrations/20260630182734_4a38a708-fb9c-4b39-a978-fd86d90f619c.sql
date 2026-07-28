
CREATE TABLE IF NOT EXISTS public.planipret_ns_request_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  path TEXT NOT NULL,
  query_params JSONB,
  full_url TEXT,
  status INTEGER,
  duration_ms INTEGER,
  ok BOOLEAN,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ns_request_log_created ON public.planipret_ns_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ns_request_log_fn ON public.planipret_ns_request_log (function_name, created_at DESC);
GRANT SELECT ON public.planipret_ns_request_log TO authenticated;
GRANT ALL  ON public.planipret_ns_request_log TO service_role;
ALTER TABLE public.planipret_ns_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ns_request_log" ON public.planipret_ns_request_log
  FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) = true);

CREATE TABLE IF NOT EXISTS public.planipret_edge_function_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running | success | error
  summary JSONB,
  error TEXT,
  triggered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edge_runs_fn_started ON public.planipret_edge_function_runs (function_name, started_at DESC);
GRANT SELECT ON public.planipret_edge_function_runs TO authenticated;
GRANT ALL  ON public.planipret_edge_function_runs TO service_role;
ALTER TABLE public.planipret_edge_function_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read edge_function_runs" ON public.planipret_edge_function_runs
  FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) = true);
