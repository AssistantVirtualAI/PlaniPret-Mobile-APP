ALTER TABLE public.lemtel_softphone_invites
  ADD COLUMN IF NOT EXISTS revoked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_sent  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS ip_address  inet,
  ADD COLUMN IF NOT EXISTS user_agent  text;

CREATE INDEX IF NOT EXISTS idx_lemtel_invites_active
  ON public.lemtel_softphone_invites(softphone_user_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;