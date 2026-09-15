ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_consent_version text,
  ADD COLUMN IF NOT EXISTS ai_consent_revoked_at timestamptz;

COMMENT ON COLUMN public.planipret_profiles.ai_consent_at IS
  'Date de la dernière acceptation explicite du traitement par les fournisseurs IA tiers.';
COMMENT ON COLUMN public.planipret_profiles.ai_consent_version IS
  'Version du texte de consentement IA accepté.';
COMMENT ON COLUMN public.planipret_profiles.ai_consent_revoked_at IS
  'Date de révocation; lorsqu’elle est postérieure à ai_consent_at, AVA est bloquée.';
