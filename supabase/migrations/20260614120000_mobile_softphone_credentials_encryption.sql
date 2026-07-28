-- Mobile softphone credential hardening: encrypted-at-rest SIP passwords.
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS sip_password_encrypted text;

COMMENT ON COLUMN public.pbx_softphone_users.sip_password_encrypted IS
  'AES-GCM encrypted SIP password envelope used by softphone-credentials when PBX_SECRETS_KEY or PBX_ENCRYPTION_KEY is configured.';

CREATE INDEX IF NOT EXISTS idx_pbx_softphone_users_password_encrypted
  ON public.pbx_softphone_users (id)
  WHERE sip_password_encrypted IS NOT NULL;
