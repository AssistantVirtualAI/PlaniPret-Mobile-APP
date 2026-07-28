
-- ============ AUDIT LOG ============
CREATE TABLE public.planipret_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL,
  admin_id uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_audit_user ON public.planipret_audit_log(user_id, created_at DESC);
CREATE INDEX idx_pp_audit_action ON public.planipret_audit_log(action, created_at DESC);
CREATE INDEX idx_pp_audit_created ON public.planipret_audit_log(created_at DESC);

GRANT SELECT ON public.planipret_audit_log TO authenticated;
GRANT ALL ON public.planipret_audit_log TO service_role;

ALTER TABLE public.planipret_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PP admins read audit log"
  ON public.planipret_audit_log FOR SELECT
  TO authenticated
  USING (public.is_planipret_admin(auth.uid()));

-- inserts only via service_role (no INSERT policy for authenticated)

-- ============ CONSENT SETTINGS ============
CREATE TABLE public.planipret_consent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL DEFAULT 'planipret.ca',
  recording_consent_enabled boolean NOT NULL DEFAULT true,
  consent_message_fr text NOT NULL DEFAULT 'Bonjour. Cet appel peut être enregistré à des fins de qualité et de formation. En continuant, vous consentez à l''enregistrement de cet appel.',
  consent_message_en text NOT NULL DEFAULT 'Hello. This call may be recorded for quality and training purposes. By continuing, you consent to the recording of this call.',
  consent_delay_seconds int NOT NULL DEFAULT 5 CHECK (consent_delay_seconds BETWEEN 3 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.planipret_consent_settings TO authenticated;
GRANT ALL ON public.planipret_consent_settings TO service_role;

ALTER TABLE public.planipret_consent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PP admins read consent settings"
  ON public.planipret_consent_settings FOR SELECT
  TO authenticated USING (public.is_planipret_admin(auth.uid()));
CREATE POLICY "PP admins write consent settings"
  ON public.planipret_consent_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_planipret_admin(auth.uid()));
CREATE POLICY "PP admins update consent settings"
  ON public.planipret_consent_settings FOR UPDATE
  TO authenticated USING (public.is_planipret_admin(auth.uid()));

INSERT INTO public.planipret_consent_settings (domain) VALUES ('planipret.ca');

CREATE TRIGGER pp_consent_settings_touch
  BEFORE UPDATE ON public.planipret_consent_settings
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- ============ CALL CONSENTS ============
CREATE TABLE public.planipret_call_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id text NOT NULL,
  user_id uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL,
  consent_given boolean NOT NULL DEFAULT false,
  consent_timestamp timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_call_consents_call ON public.planipret_call_consents(call_id);
CREATE INDEX idx_pp_call_consents_user ON public.planipret_call_consents(user_id);

GRANT SELECT ON public.planipret_call_consents TO authenticated;
GRANT ALL ON public.planipret_call_consents TO service_role;

ALTER TABLE public.planipret_call_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PP admins read all consents"
  ON public.planipret_call_consents FOR SELECT
  TO authenticated USING (public.is_planipret_admin(auth.uid()));
CREATE POLICY "Users read own consents"
  ON public.planipret_call_consents FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- ============ RETENTION POLICY ============
CREATE TABLE public.planipret_retention_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calls_retention_days int NOT NULL DEFAULT 365,
  messages_retention_days int NOT NULL DEFAULT 365,
  voicemails_retention_days int NOT NULL DEFAULT 180,
  transcripts_retention_days int NOT NULL DEFAULT 730,
  ai_insights_retention_days int NOT NULL DEFAULT 730,
  audit_logs_retention_days int NOT NULL DEFAULT 730,
  recordings_retention_days int NOT NULL DEFAULT 90,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.planipret_retention_policy TO authenticated;
GRANT ALL ON public.planipret_retention_policy TO service_role;

ALTER TABLE public.planipret_retention_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PP admins read retention"
  ON public.planipret_retention_policy FOR SELECT
  TO authenticated USING (public.is_planipret_admin(auth.uid()));
CREATE POLICY "PP admins write retention"
  ON public.planipret_retention_policy FOR INSERT
  TO authenticated WITH CHECK (public.is_planipret_admin(auth.uid()));
CREATE POLICY "PP admins update retention"
  ON public.planipret_retention_policy FOR UPDATE
  TO authenticated USING (public.is_planipret_admin(auth.uid()));

INSERT INTO public.planipret_retention_policy DEFAULT VALUES;

CREATE TRIGGER pp_retention_touch
  BEFORE UPDATE ON public.planipret_retention_policy
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- ============ SETTINGS EXTENSIONS ============
ALTER TABLE public.planipret_settings
  ADD COLUMN IF NOT EXISTS session_timeout_minutes int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS session_timeout_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_concurrent_sessions int NOT NULL DEFAULT 3;

-- ============ PROFILE PRIVACY ============
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version text,
  ADD COLUMN IF NOT EXISTS recording_consent boolean NOT NULL DEFAULT false;
