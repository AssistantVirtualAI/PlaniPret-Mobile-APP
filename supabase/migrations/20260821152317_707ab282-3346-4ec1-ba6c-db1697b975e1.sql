CREATE TABLE IF NOT EXISTS public.planipret_portal_2fa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  sent_via text,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_2fa_challenges_user ON public.planipret_portal_2fa_challenges (user_id, created_at DESC);
GRANT ALL ON public.planipret_portal_2fa_challenges TO service_role;
ALTER TABLE public.planipret_portal_2fa_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.planipret_portal_2fa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_2fa_sessions_user ON public.planipret_portal_2fa_sessions (user_id);
GRANT SELECT ON public.planipret_portal_2fa_sessions TO authenticated;
GRANT ALL ON public.planipret_portal_2fa_sessions TO service_role;
ALTER TABLE public.planipret_portal_2fa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "2fa sessions readable by owner" ON public.planipret_portal_2fa_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());