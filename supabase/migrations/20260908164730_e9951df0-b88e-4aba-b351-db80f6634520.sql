CREATE TABLE public.planipret_ms_auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  email text,
  attempt_type text NOT NULL DEFAULT 'refresh',
  status text NOT NULL,
  error_code text,
  error_message text,
  source text,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_ms_auth_attempts_profile ON public.planipret_ms_auth_attempts (profile_id, created_at DESC);
CREATE INDEX idx_pp_ms_auth_attempts_created ON public.planipret_ms_auth_attempts (created_at DESC);

GRANT SELECT ON public.planipret_ms_auth_attempts TO authenticated;
GRANT ALL ON public.planipret_ms_auth_attempts TO service_role;

ALTER TABLE public.planipret_ms_auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_ms_auth_attempts_admin_read"
ON public.planipret_ms_auth_attempts
FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()));