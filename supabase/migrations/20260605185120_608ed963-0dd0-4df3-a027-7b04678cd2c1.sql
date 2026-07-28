
-- ===================== TABLES =====================
CREATE TABLE public.pbx_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fusionpbx',
  base_url text,
  domain text,
  status text DEFAULT 'disconnected',
  last_sync_at timestamptz,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text,
  extension text NOT NULL,
  effective_cid_name text,
  effective_cid_number text,
  call_group text,
  voicemail_enabled boolean DEFAULT true,
  call_recording text DEFAULT 'none',
  do_not_disturb boolean DEFAULT false,
  forward_all_destination text,
  enabled boolean DEFAULT true,
  description text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text,
  mac_address text,
  label text,
  vendor text,
  template text,
  profile text,
  assigned_extension_id uuid REFERENCES public.pbx_extensions(id) ON DELETE SET NULL,
  enabled boolean DEFAULT true,
  registration_status text DEFAULT 'unregistered',
  last_seen_at timestamptz,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_phone_number_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE CASCADE,
  destination_type text,
  destination_id text,
  voice_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  sms_enabled boolean DEFAULT false,
  ai_enabled boolean DEFAULT false,
  routing_rules jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text UNIQUE,
  direction text,
  call_status text,
  extension text,
  caller_name text,
  caller_number text,
  destination text,
  start_at timestamptz,
  answer_at timestamptz,
  end_at timestamptz,
  duration_seconds integer DEFAULT 0,
  billsec integer DEFAULT 0,
  tta integer,
  pdd integer,
  mos numeric,
  codec text,
  missed_call boolean DEFAULT false,
  voicemail_message boolean DEFAULT false,
  recording_url text,
  has_recording boolean DEFAULT false,
  transcribed boolean DEFAULT false,
  analyzed boolean DEFAULT false,
  ai_processing boolean DEFAULT false,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  call_record_id uuid REFERENCES public.pbx_call_records(id) ON DELETE CASCADE,
  pbx_uuid text,
  file_url text,
  storage_path text,
  duration_seconds integer,
  direction text,
  recorded_at timestamptz,
  transcription_status text DEFAULT 'pending',
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  call_record_id uuid REFERENCES public.pbx_call_records(id) ON DELETE CASCADE,
  recording_id uuid REFERENCES public.pbx_call_recordings(id) ON DELETE CASCADE,
  transcript_text text,
  speaker_segments jsonb DEFAULT '[]'::jsonb,
  language text DEFAULT 'fr',
  confidence numeric,
  provider text DEFAULT 'claude',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  call_record_id uuid REFERENCES public.pbx_call_records(id) ON DELETE CASCADE,
  summary text,
  sentiment text,
  satisfaction_score integer,
  intent text,
  topics text[],
  action_items text[],
  risks text[],
  sales_opportunities text[],
  quality_score integer,
  escalation_needed boolean DEFAULT false,
  key_phrases text[],
  prompt_version text,
  ai_model text DEFAULT 'claude-sonnet-4-20250514',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_ivrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text,
  name text NOT NULL,
  extension text,
  greet_long text,
  greet_short text,
  timeout_ms integer DEFAULT 3000,
  exit_action text,
  direct_dial boolean DEFAULT true,
  ringback text,
  enabled boolean DEFAULT true,
  description text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_ivr_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ivr_id uuid NOT NULL REFERENCES public.pbx_ivrs(id) ON DELETE CASCADE,
  digit text NOT NULL,
  destination_type text,
  destination_id text,
  description text,
  sort_order integer DEFAULT 0
);

CREATE TABLE public.pbx_call_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text,
  name text NOT NULL,
  extension text,
  strategy text DEFAULT 'ring-all',
  music_on_hold text,
  record_enabled boolean DEFAULT false,
  max_wait_time integer DEFAULT 60,
  timeout_action text,
  enabled boolean DEFAULT true,
  description text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_queue_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.pbx_call_queues(id) ON DELETE CASCADE,
  extension_id uuid REFERENCES public.pbx_extensions(id) ON DELETE SET NULL,
  agent_name text,
  agent_id text,
  tier_level integer DEFAULT 1,
  tier_position integer DEFAULT 1,
  status text DEFAULT 'Available',
  wrap_up_time integer DEFAULT 10,
  raw_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.pbx_ring_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pbx_uuid text,
  name text NOT NULL,
  extension text,
  strategy text DEFAULT 'simultaneous',
  forwarding text,
  enabled boolean DEFAULT true,
  description text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_sms_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  did_number text NOT NULL,
  contact_phone text NOT NULL,
  contact_name text,
  assigned_user_id uuid,
  assigned_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  unread_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(did_number, contact_phone)
);

CREATE TABLE public.pbx_sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.pbx_sms_threads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction text NOT NULL,
  from_number text,
  to_number text,
  body text,
  media_urls jsonb DEFAULT '[]'::jsonb,
  provider_message_id text,
  status text DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  raw_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.pbx_softphone_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  portal_user_id uuid,
  extension_id uuid REFERENCES public.pbx_extensions(id) ON DELETE SET NULL,
  extension text NOT NULL,
  sip_domain text,
  display_name text,
  status text DEFAULT 'offline',
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_ivr_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ivr_id uuid REFERENCES public.pbx_ivrs(id) ON DELETE CASCADE,
  script_text text,
  audio_url text,
  storage_path text,
  elevenlabs_voice_id text,
  language text DEFAULT 'fr',
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  stats jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pbx_feature_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature text NOT NULL,
  activate_code text,
  deactivate_code text,
  dial_code text,
  enabled boolean DEFAULT true
);

-- ===================== GRANTS + RLS =====================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pbx_integrations','pbx_extensions','pbx_devices','pbx_phone_number_assignments',
    'pbx_call_records','pbx_call_recordings','pbx_call_transcripts','pbx_ai_insights',
    'pbx_ivrs','pbx_ivr_options','pbx_call_queues','pbx_queue_agents','pbx_ring_groups',
    'pbx_sms_threads','pbx_sms_messages','pbx_softphone_users','pbx_ivr_audio',
    'pbx_sync_jobs','pbx_feature_codes'
  ])
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Helper for child tables that route through parent org
-- Generic policy creator
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pbx_integrations','pbx_extensions','pbx_devices','pbx_phone_number_assignments',
    'pbx_call_records','pbx_call_recordings','pbx_call_transcripts','pbx_ai_insights',
    'pbx_ivrs','pbx_call_queues','pbx_ring_groups',
    'pbx_sms_threads','pbx_sms_messages','pbx_softphone_users','pbx_ivr_audio',
    'pbx_sync_jobs','pbx_feature_codes'
  ])
  LOOP
    EXECUTE format($f$
      CREATE POLICY "org_members_select" ON public.%I
        FOR SELECT TO authenticated
        USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())) OR public.is_super_admin(auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "org_admin_modify" ON public.%I
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
        WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
    $f$, t);
  END LOOP;
END $$;

-- Child tables (no organization_id column) — derive from parent
CREATE POLICY "ivr_options_select" ON public.pbx_ivr_options FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pbx_ivrs i WHERE i.id = ivr_id
  AND (i.organization_id IN (SELECT public.get_user_organization_ids(auth.uid())) OR public.is_super_admin(auth.uid()))));
CREATE POLICY "ivr_options_modify" ON public.pbx_ivr_options FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.pbx_ivrs i WHERE i.id = ivr_id
  AND (public.has_role(auth.uid(), i.organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.pbx_ivrs i WHERE i.id = ivr_id
  AND (public.has_role(auth.uid(), i.organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))));

CREATE POLICY "queue_agents_select" ON public.pbx_queue_agents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pbx_call_queues q WHERE q.id = queue_id
  AND (q.organization_id IN (SELECT public.get_user_organization_ids(auth.uid())) OR public.is_super_admin(auth.uid()))));
CREATE POLICY "queue_agents_modify" ON public.pbx_queue_agents FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.pbx_call_queues q WHERE q.id = queue_id
  AND (public.has_role(auth.uid(), q.organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))))
WITH CHECK (EXISTS (SELECT 1 FROM public.pbx_call_queues q WHERE q.id = queue_id
  AND (public.has_role(auth.uid(), q.organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))));

-- ===================== updated_at TRIGGERS =====================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pbx_integrations','pbx_extensions','pbx_devices','pbx_phone_number_assignments',
    'pbx_ivrs','pbx_call_queues','pbx_ring_groups','pbx_sms_threads','pbx_softphone_users'
  ])
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ===================== INDEXES =====================
CREATE INDEX idx_pbx_extensions_org ON public.pbx_extensions(organization_id);
CREATE INDEX idx_pbx_call_records_org_start ON public.pbx_call_records(organization_id, start_at DESC);
CREATE INDEX idx_pbx_sms_threads_org ON public.pbx_sms_threads(organization_id, last_message_at DESC);
CREATE INDEX idx_pbx_sms_messages_thread ON public.pbx_sms_messages(thread_id, sent_at DESC);
CREATE INDEX idx_pbx_devices_org ON public.pbx_devices(organization_id);
CREATE INDEX idx_pbx_ivrs_org ON public.pbx_ivrs(organization_id);
