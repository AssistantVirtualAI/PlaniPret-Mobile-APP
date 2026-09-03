
CREATE TABLE IF NOT EXISTS public.planipret_proxy_health (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  function_name text not null default 'fusionpbx-proxy',
  action text,
  status_code int,
  outcome text not null,
  duration_ms int,
  error_code text,
  message text
);
GRANT SELECT ON public.planipret_proxy_health TO authenticated;
GRANT ALL ON public.planipret_proxy_health TO service_role;
ALTER TABLE public.planipret_proxy_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proxy health readable by planipret admins"
  ON public.planipret_proxy_health FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_proxy_health_created ON public.planipret_proxy_health (created_at DESC);

CREATE TABLE IF NOT EXISTS public.planipret_ai_provider_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  provider text not null,
  model text,
  status_code int,
  failover boolean not null default false,
  duration_ms int,
  error text
);
GRANT SELECT ON public.planipret_ai_provider_usage TO authenticated;
GRANT ALL ON public.planipret_ai_provider_usage TO service_role;
ALTER TABLE public.planipret_ai_provider_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai usage readable by planipret admins"
  ON public.planipret_ai_provider_usage FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.planipret_ai_provider_usage (created_at DESC);

CREATE TABLE IF NOT EXISTS public.planipret_pbx_action_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text
);
GRANT SELECT, INSERT ON public.planipret_pbx_action_queue TO authenticated;
GRANT ALL ON public.planipret_pbx_action_queue TO service_role;
ALTER TABLE public.planipret_pbx_action_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue own rows select" ON public.planipret_pbx_action_queue
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));
CREATE POLICY "queue own rows insert" ON public.planipret_pbx_action_queue
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_pbx_queue_status ON public.planipret_pbx_action_queue (status, next_attempt_at);
CREATE TRIGGER trg_pbx_queue_touch BEFORE UPDATE ON public.planipret_pbx_action_queue
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();
