
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS maestro_refresh_token text,
  ADD COLUMN IF NOT EXISTS maestro_scope text,
  ADD COLUMN IF NOT EXISTS maestro_email text;

REVOKE SELECT (maestro_refresh_token) ON public.planipret_profiles FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.planipret_maestro_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_maestro_oauth_states TO authenticated;
GRANT ALL ON public.planipret_maestro_oauth_states TO service_role;
ALTER TABLE public.planipret_maestro_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own oauth states"
ON public.planipret_maestro_oauth_states FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_pp_maestro_oauth_states_user ON public.planipret_maestro_oauth_states(user_id);
