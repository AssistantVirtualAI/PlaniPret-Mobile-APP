CREATE TABLE public.app_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  app text NOT NULL CHECK (app IN ('mobile','desktop','web')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_login_tokens_user ON public.app_login_tokens(user_id);
CREATE INDEX idx_app_login_tokens_expires ON public.app_login_tokens(expires_at);

GRANT ALL ON public.app_login_tokens TO service_role;
ALTER TABLE public.app_login_tokens ENABLE ROW LEVEL SECURITY;

-- No client policies: tokens are managed exclusively via service-role edge functions.
CREATE POLICY "deny_all_app_login_tokens" ON public.app_login_tokens
  FOR ALL USING (false) WITH CHECK (false);