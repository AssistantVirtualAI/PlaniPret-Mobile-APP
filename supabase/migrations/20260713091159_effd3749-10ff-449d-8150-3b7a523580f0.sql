
CREATE TABLE public.planipret_ava_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'websocket',
  agent_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  disconnect_reason TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_ava_sessions_user_started ON public.planipret_ava_sessions(user_id, started_at DESC);
CREATE INDEX idx_pp_ava_sessions_error ON public.planipret_ava_sessions(error_code) WHERE error_code IS NOT NULL;
CREATE INDEX idx_pp_ava_sessions_live ON public.planipret_ava_sessions(started_at DESC) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.planipret_ava_sessions TO authenticated;
GRANT ALL ON public.planipret_ava_sessions TO service_role;

ALTER TABLE public.planipret_ava_sessions ENABLE ROW LEVEL SECURITY;

-- Broker reads/writes only their own sessions
CREATE POLICY "brokers_own_sessions_select" ON public.planipret_ava_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "brokers_own_sessions_insert" ON public.planipret_ava_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "brokers_own_sessions_update" ON public.planipret_ava_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all sessions (planipret_profiles.role = 'admin')
CREATE POLICY "admins_view_all_sessions" ON public.planipret_ava_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.planipret_profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  ));
