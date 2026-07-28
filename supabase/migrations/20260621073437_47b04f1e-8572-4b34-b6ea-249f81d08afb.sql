
-- =========================================================
-- PLANIPRÊT PHASE 1 — Tables + RLS (AVA-only)
-- =========================================================

-- Helper: identifiant figé de l'organisation AVA Main Dashboard
CREATE OR REPLACE FUNCTION public.planipret_ava_org_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT '17d6507f-a9ca-409d-8e49-371d50332615'::uuid $$;

REVOKE EXECUTE ON FUNCTION public.planipret_ava_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planipret_ava_org_id() TO authenticated, service_role;

-- Helper: l'utilisateur est-il admin Planipret de AVA ?
CREATE OR REPLACE FUNCTION public.is_planipret_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = public.planipret_ava_org_id()
      AND role IN ('planipret_admin','org_admin','super_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_planipret_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_planipret_admin(uuid) TO authenticated, service_role;

-- Helper: l'utilisateur est-il broker Planipret AVA ?
CREATE OR REPLACE FUNCTION public.is_planipret_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = public.planipret_ava_org_id()
      AND role IN ('planipret_broker','planipret_admin','org_admin','super_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_planipret_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_planipret_member(uuid) TO authenticated, service_role;

-- Trigger updated_at générique (si pas déjà présent)
CREATE OR REPLACE FUNCTION public.planipret_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- 1) planipret_profiles
-- =========================================================
CREATE TABLE public.planipret_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  full_name text,
  email text,
  phone text,
  extension text,
  ns_domain text,
  ns_user_id text,
  role text NOT NULL DEFAULT 'broker' CHECK (role IN ('broker','admin')),
  mobile_app_enabled boolean NOT NULL DEFAULT false,
  voice_agent_enabled boolean NOT NULL DEFAULT false,
  avatar_url text,
  language text NOT NULL DEFAULT 'fr',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_profiles_user ON public.planipret_profiles(user_id);
CREATE INDEX idx_pp_profiles_ext ON public.planipret_profiles(extension);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_profiles TO authenticated;
GRANT ALL ON public.planipret_profiles TO service_role;
ALTER TABLE public.planipret_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_profiles_self_read ON public.planipret_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));

CREATE POLICY pp_profiles_admin_write ON public.planipret_profiles
  FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid())
              AND organization_id = public.planipret_ava_org_id());

CREATE POLICY pp_profiles_self_update ON public.planipret_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_profiles_updated
  BEFORE UPDATE ON public.planipret_profiles
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 2) planipret_phone_calls
-- =========================================================
CREATE TABLE public.planipret_phone_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  ns_call_id text,
  ns_domain text,
  extension text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','missed')),
  status text,
  from_number text,
  from_name text,
  to_number text,
  to_name text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer DEFAULT 0,
  recording_url text,
  transcript text,
  ai_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_calls_user_started ON public.planipret_phone_calls(user_id, started_at DESC);
CREATE INDEX idx_pp_calls_ns ON public.planipret_phone_calls(ns_call_id);
CREATE INDEX idx_pp_calls_direction ON public.planipret_phone_calls(direction);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_phone_calls TO authenticated;
GRANT ALL ON public.planipret_phone_calls TO service_role;
ALTER TABLE public.planipret_phone_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_calls_self ON public.planipret_phone_calls
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_calls_updated
  BEFORE UPDATE ON public.planipret_phone_calls
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 3) planipret_phone_messages
-- =========================================================
CREATE TABLE public.planipret_phone_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  ns_message_id text,
  thread_id text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number text,
  to_number text,
  body text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text,
  read_at timestamptz,
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_msg_user_sent ON public.planipret_phone_messages(user_id, sent_at DESC);
CREATE INDEX idx_pp_msg_thread ON public.planipret_phone_messages(thread_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_phone_messages TO authenticated;
GRANT ALL ON public.planipret_phone_messages TO service_role;
ALTER TABLE public.planipret_phone_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_msg_self ON public.planipret_phone_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_msg_updated
  BEFORE UPDATE ON public.planipret_phone_messages
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 4) planipret_voicemails
-- =========================================================
CREATE TABLE public.planipret_voicemails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  ns_vm_id text,
  folder text NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','saved','deleted')),
  from_number text,
  from_name text,
  duration_seconds integer DEFAULT 0,
  audio_url text,
  transcript text,
  is_read boolean NOT NULL DEFAULT false,
  received_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_vm_user_received ON public.planipret_voicemails(user_id, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_voicemails TO authenticated;
GRANT ALL ON public.planipret_voicemails TO service_role;
ALTER TABLE public.planipret_voicemails ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_vm_self ON public.planipret_voicemails
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_vm_updated
  BEFORE UPDATE ON public.planipret_voicemails
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 5) planipret_ai_insights
-- =========================================================
CREATE TABLE public.planipret_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  call_id uuid REFERENCES public.planipret_phone_calls(id) ON DELETE CASCADE,
  summary text,
  customer_intent text,
  sentiment text,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  coaching_notes text,
  raw_response jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_ai_user ON public.planipret_ai_insights(user_id);
CREATE INDEX idx_pp_ai_call ON public.planipret_ai_insights(call_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ai_insights TO authenticated;
GRANT ALL ON public.planipret_ai_insights TO service_role;
ALTER TABLE public.planipret_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_ai_self ON public.planipret_ai_insights
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_ai_updated
  BEFORE UPDATE ON public.planipret_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 6) planipret_contacts
-- =========================================================
CREATE TABLE public.planipret_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  external_id text,
  source text DEFAULT 'manual',
  full_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  mobile text,
  company text,
  notes text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_contacts_user ON public.planipret_contacts(user_id);
CREATE INDEX idx_pp_contacts_phone ON public.planipret_contacts(phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_contacts TO authenticated;
GRANT ALL ON public.planipret_contacts TO service_role;
ALTER TABLE public.planipret_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_contacts_self ON public.planipret_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_contacts_updated
  BEFORE UPDATE ON public.planipret_contacts
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

-- =========================================================
-- 7) planipret_settings
-- =========================================================
CREATE TABLE public.planipret_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL DEFAULT public.planipret_ava_org_id()
    CHECK (organization_id = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid),
  notifications_enabled boolean NOT NULL DEFAULT true,
  ringtone text DEFAULT 'default',
  theme text DEFAULT 'system',
  language text DEFAULT 'fr',
  voice_agent_lang text DEFAULT 'fr-CA',
  maestro_connected boolean NOT NULL DEFAULT false,
  m365_connected boolean NOT NULL DEFAULT false,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_settings TO authenticated;
GRANT ALL ON public.planipret_settings TO service_role;
ALTER TABLE public.planipret_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY pp_settings_self ON public.planipret_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
              AND organization_id = public.planipret_ava_org_id());

CREATE TRIGGER trg_pp_settings_updated
  BEFORE UPDATE ON public.planipret_settings
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();
