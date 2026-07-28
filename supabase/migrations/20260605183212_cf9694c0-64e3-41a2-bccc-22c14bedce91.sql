
-- Helper: check if user is a Lemtel org member
CREATE OR REPLACE FUNCTION public.is_lemtel_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
  ) OR public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_lemtel_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid, 'org_admin'::app_role)
    OR public.is_super_admin(_user_id)
$$;

-- 1. lemtel_config (key/value secrets store)
CREATE TABLE public.lemtel_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  is_secret boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_config TO authenticated;
GRANT ALL ON public.lemtel_config TO service_role;
ALTER TABLE public.lemtel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel admins manage config" ON public.lemtel_config FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- Safe view: non-secret keys only
CREATE OR REPLACE VIEW public.lemtel_config_safe AS
  SELECT id, key, CASE WHEN is_secret THEN NULL ELSE value END as value, is_secret, updated_at
  FROM public.lemtel_config;
GRANT SELECT ON public.lemtel_config_safe TO authenticated;

-- 2. lemtel_customers
CREATE TABLE public.lemtel_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  plan text NOT NULL DEFAULT 'basic',
  notes text,
  portal_enabled boolean NOT NULL DEFAULT false,
  portal_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_customers TO authenticated;
GRANT ALL ON public.lemtel_customers TO service_role;
ALTER TABLE public.lemtel_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read customers" ON public.lemtel_customers FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid()) OR portal_user_id = auth.uid());
CREATE POLICY "lemtel admins manage customers" ON public.lemtel_customers FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- 3. lemtel_dids
CREATE TABLE public.lemtel_dids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE,
  assigned_type text NOT NULL DEFAULT 'unassigned',
  assigned_id text,
  telnyx_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_dids TO authenticated;
GRANT ALL ON public.lemtel_dids TO service_role;
ALTER TABLE public.lemtel_dids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read dids" ON public.lemtel_dids FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "lemtel admins manage dids" ON public.lemtel_dids FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- 4. lemtel_cdrs_cache
CREATE TABLE public.lemtel_cdrs_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE SET NULL,
  call_uuid text NOT NULL UNIQUE,
  direction text,
  caller_id_name text,
  caller_id_number text,
  caller_destination text,
  duration integer NOT NULL DEFAULT 0,
  billsec integer NOT NULL DEFAULT 0,
  record_path text,
  record_name text,
  start_stamp timestamptz,
  answer_stamp timestamptz,
  end_stamp timestamptz,
  missed_call boolean NOT NULL DEFAULT false,
  voicemail_message boolean NOT NULL DEFAULT false,
  transcribed boolean NOT NULL DEFAULT false,
  analyzed boolean NOT NULL DEFAULT false,
  ai_processing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lemtel_cdrs_start_stamp ON public.lemtel_cdrs_cache (start_stamp DESC);
CREATE INDEX idx_lemtel_cdrs_customer ON public.lemtel_cdrs_cache (customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_cdrs_cache TO authenticated;
GRANT ALL ON public.lemtel_cdrs_cache TO service_role;
ALTER TABLE public.lemtel_cdrs_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read cdrs" ON public.lemtel_cdrs_cache FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "lemtel admins manage cdrs" ON public.lemtel_cdrs_cache FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- 5. lemtel_transcriptions
CREATE TABLE public.lemtel_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_uuid text NOT NULL REFERENCES public.lemtel_cdrs_cache(call_uuid) ON DELETE CASCADE,
  transcript_text text,
  sentiment text,
  topics text[],
  action_items text[],
  summary text,
  satisfaction_score integer,
  escalation_needed boolean NOT NULL DEFAULT false,
  key_phrases text[],
  ai_model text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_transcriptions TO authenticated;
GRANT ALL ON public.lemtel_transcriptions TO service_role;
ALTER TABLE public.lemtel_transcriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read transcriptions" ON public.lemtel_transcriptions FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_cdrs_cache c
      JOIN public.lemtel_customers cu ON cu.id = c.customer_id
      WHERE c.call_uuid = lemtel_transcriptions.call_uuid AND cu.portal_user_id = auth.uid()));
CREATE POLICY "lemtel admins manage transcriptions" ON public.lemtel_transcriptions FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- 6. lemtel_voice_agents
CREATE TABLE public.lemtel_voice_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE CASCADE,
  elevenlabs_agent_id text NOT NULL,
  did_id uuid REFERENCES public.lemtel_dids(id) ON DELETE SET NULL,
  extension text,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  total_calls integer NOT NULL DEFAULT 0,
  avg_duration integer NOT NULL DEFAULT 0,
  escalation_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_voice_agents TO authenticated;
GRANT ALL ON public.lemtel_voice_agents TO service_role;
ALTER TABLE public.lemtel_voice_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read voice agents" ON public.lemtel_voice_agents FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "lemtel admins manage voice agents" ON public.lemtel_voice_agents FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- 7. lemtel_sms_threads
CREATE TABLE public.lemtel_sms_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE SET NULL,
  did_number text NOT NULL,
  contact_number text NOT NULL,
  contact_name text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(did_number, contact_number)
);
CREATE INDEX idx_lemtel_sms_did ON public.lemtel_sms_threads (did_number);
CREATE INDEX idx_lemtel_sms_last_msg ON public.lemtel_sms_threads (last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_sms_threads TO authenticated;
GRANT ALL ON public.lemtel_sms_threads TO service_role;
ALTER TABLE public.lemtel_sms_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read sms" ON public.lemtel_sms_threads FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "lemtel members write sms" ON public.lemtel_sms_threads FOR ALL TO authenticated
  USING (public.is_lemtel_member(auth.uid())) WITH CHECK (public.is_lemtel_member(auth.uid()));

-- 8. lemtel_softphone_users (sip_password is service_role only)
CREATE TABLE public.lemtel_softphone_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  extension text NOT NULL,
  sip_password text,
  sip_domain text,
  display_name text,
  status text NOT NULL DEFAULT 'offline',
  device_type text NOT NULL DEFAULT 'web',
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (id, customer_id, portal_user_id, extension, sip_domain, display_name, status, device_type, last_seen, created_at, updated_at),
  INSERT, UPDATE, DELETE ON public.lemtel_softphone_users TO authenticated;
GRANT ALL ON public.lemtel_softphone_users TO service_role;
ALTER TABLE public.lemtel_softphone_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read softphone users" ON public.lemtel_softphone_users FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid()) OR portal_user_id = auth.uid());
CREATE POLICY "lemtel admins manage softphone users" ON public.lemtel_softphone_users FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));
CREATE POLICY "users update own softphone status" ON public.lemtel_softphone_users FOR UPDATE TO authenticated
  USING (portal_user_id = auth.uid()) WITH CHECK (portal_user_id = auth.uid());

-- 9. lemtel_ivr_audio
CREATE TABLE public.lemtel_ivr_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.lemtel_customers(id) ON DELETE CASCADE,
  ivr_menu_id text,
  script_text text,
  audio_url text,
  elevenlabs_voice_id text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_ivr_audio TO authenticated;
GRANT ALL ON public.lemtel_ivr_audio TO service_role;
ALTER TABLE public.lemtel_ivr_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lemtel members read ivr" ON public.lemtel_ivr_audio FOR SELECT TO authenticated
  USING (public.is_lemtel_member(auth.uid())
    OR EXISTS (SELECT 1 FROM public.lemtel_customers c WHERE c.id = customer_id AND c.portal_user_id = auth.uid()));
CREATE POLICY "lemtel admins manage ivr" ON public.lemtel_ivr_audio FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid())) WITH CHECK (public.is_lemtel_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER tr_lemtel_customers_updated BEFORE UPDATE ON public.lemtel_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_dids_updated BEFORE UPDATE ON public.lemtel_dids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_voice_agents_updated BEFORE UPDATE ON public.lemtel_voice_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_sms_threads_updated BEFORE UPDATE ON public.lemtel_sms_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_softphone_users_updated BEFORE UPDATE ON public.lemtel_softphone_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_ivr_audio_updated BEFORE UPDATE ON public.lemtel_ivr_audio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_lemtel_config_updated BEFORE UPDATE ON public.lemtel_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lemtel_sms_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lemtel_cdrs_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lemtel_softphone_users;
