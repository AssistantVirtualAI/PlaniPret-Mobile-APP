
-- =====================================================
-- Helper: current user's org IDs (SECURITY DEFINER to avoid RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT organization_id FROM public.pbx_softphone_users WHERE portal_user_id = auth.uid()
  UNION
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
$$;

-- =====================================================
-- ORG CHAT CHANNELS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.org_chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  channel_type text NOT NULL DEFAULT 'public' CHECK (channel_type IN ('public','private','dm','announcement')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  members uuid[] NOT NULL DEFAULT '{}',
  pinned_messages uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_channels TO authenticated;
GRANT ALL ON public.org_chat_channels TO service_role;
ALTER TABLE public.org_chat_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read channels" ON public.org_chat_channels
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members create channels" ON public.org_chat_channels
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()) AND created_by = auth.uid());
CREATE POLICY "org members update own channels" ON public.org_chat_channels
  FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members delete own channels" ON public.org_chat_channels
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role));

-- =====================================================
-- ORG CHAT MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.org_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel_id uuid REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  sender_extension text,
  recipient_id uuid,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','file','call_log','voicemail','ai_summary','system')),
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to uuid,
  read_by uuid[] NOT NULL DEFAULT '{}',
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_chat_messages_channel ON public.org_chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_chat_messages_dm ON public.org_chat_messages(organization_id, sender_id, recipient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_messages TO authenticated;
GRANT ALL ON public.org_chat_messages TO service_role;
ALTER TABLE public.org_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read messages" ON public.org_chat_messages
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members send messages" ON public.org_chat_messages
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()) AND sender_id = auth.uid());
CREATE POLICY "senders edit own messages" ON public.org_chat_messages
  FOR UPDATE TO authenticated USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "senders delete own messages" ON public.org_chat_messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

-- =====================================================
-- USER PRESENCE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  extension text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('available','busy','away','dnd','offline','out_of_office')),
  status_message text,
  status_emoji text,
  return_at timestamptz,
  call_state text NOT NULL DEFAULT 'idle' CHECK (call_state IN ('idle','ringing','active','held')),
  platform text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence TO authenticated;
GRANT ALL ON public.user_presence TO service_role;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read presence" ON public.user_presence
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()) OR user_id = auth.uid());
CREATE POLICY "users upsert own presence" ON public.user_presence
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own presence" ON public.user_presence
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- VOICEMAILS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_voicemails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  extension text NOT NULL,
  mailbox text,
  caller_number text,
  caller_name text,
  received_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  audio_storage_path text,
  transcript text,
  ai_summary text,
  ai_tags text[] NOT NULL DEFAULT '{}',
  folder text NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','archived','trash')),
  read_at timestamptz,
  deleted_at timestamptz,
  fusionpbx_uuid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pbx_voicemails_org_ext ON public.pbx_voicemails(organization_id, extension, received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_voicemails TO authenticated;
GRANT ALL ON public.pbx_voicemails TO service_role;
ALTER TABLE public.pbx_voicemails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read voicemails" ON public.pbx_voicemails
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members manage voicemails" ON public.pbx_voicemails
  FOR UPDATE TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members delete voicemails" ON public.pbx_voicemails
  FOR DELETE TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));

-- =====================================================
-- VOICEMAIL SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_voicemail_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  greeting_type text NOT NULL DEFAULT 'default' CHECK (greeting_type IN ('default','custom','tts')),
  greeting_storage_path text,
  greeting_tts_text text,
  pin_hash text,
  transcription_enabled boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_sms boolean NOT NULL DEFAULT false,
  notify_push boolean NOT NULL DEFAULT true,
  attach_audio_email boolean NOT NULL DEFAULT true,
  notify_email_address text,
  notify_sms_number text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_voicemail_settings TO authenticated;
GRANT ALL ON public.pbx_voicemail_settings TO service_role;
ALTER TABLE public.pbx_voicemail_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own vm settings" ON public.pbx_voicemail_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- CALL FORWARDING
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_call_forwarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  always_enabled boolean NOT NULL DEFAULT false,
  always_to text,
  busy_enabled boolean NOT NULL DEFAULT false,
  busy_to text,
  no_answer_enabled boolean NOT NULL DEFAULT false,
  no_answer_to text,
  no_answer_seconds integer NOT NULL DEFAULT 20,
  offline_enabled boolean NOT NULL DEFAULT false,
  offline_to text,
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  allow_from text NOT NULL DEFAULT 'all' CHECK (allow_from IN ('all','team','whitelist')),
  whitelist text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_call_forwarding TO authenticated;
GRANT ALL ON public.pbx_call_forwarding TO service_role;
ALTER TABLE public.pbx_call_forwarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own forwarding" ON public.pbx_call_forwarding
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- CALL RECORDING RULES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_call_recording_rules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  record_all boolean NOT NULL DEFAULT false,
  record_inbound boolean NOT NULL DEFAULT false,
  record_outbound boolean NOT NULL DEFAULT false,
  announce boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_call_recording_rules TO authenticated;
GRANT ALL ON public.pbx_call_recording_rules TO service_role;
ALTER TABLE public.pbx_call_recording_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own recording rules" ON public.pbx_call_recording_rules
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- USER DEVICES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  device_name text,
  user_agent text,
  push_token text,
  current_session boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_user_devices TO authenticated;
GRANT ALL ON public.pbx_user_devices TO service_role;
ALTER TABLE public.pbx_user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own devices" ON public.pbx_user_devices
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- QUEUE AGENT STATE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pbx_queue_agent_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  queue_id text NOT NULL,
  queue_name text,
  paused boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_call_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, queue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_queue_agent_state TO authenticated;
GRANT ALL ON public.pbx_queue_agent_state TO service_role;
ALTER TABLE public.pbx_queue_agent_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read queue state" ON public.pbx_queue_agent_state
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()) OR user_id = auth.uid());
CREATE POLICY "users update own queue state" ON public.pbx_queue_agent_state
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users insert own queue state" ON public.pbx_queue_agent_state
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =====================================================
-- NOTIFICATION PREFS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_prefs TO authenticated;
GRANT ALL ON public.user_notification_prefs TO service_role;
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own notif prefs" ON public.user_notification_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- EXTEND pbx_call_records
-- =====================================================
ALTER TABLE public.pbx_call_records
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crm_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url text;

-- =====================================================
-- EXTEND pbx_softphone_users
-- =====================================================
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS custom_status text,
  ADD COLUMN IF NOT EXISTS status_emoji text,
  ADD COLUMN IF NOT EXISTS out_of_office_until timestamptz;

-- =====================================================
-- RPCs
-- =====================================================
CREATE OR REPLACE FUNCTION public.upsert_user_presence(
  _status text, _message text DEFAULT NULL, _emoji text DEFAULT NULL,
  _call_state text DEFAULT 'idle', _platform text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _ext text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT organization_id, extension INTO _org, _ext FROM public.pbx_softphone_users WHERE portal_user_id = _uid LIMIT 1;
  INSERT INTO public.user_presence (user_id, organization_id, extension, status, status_message, status_emoji, call_state, platform, last_seen_at, updated_at)
  VALUES (_uid, _org, _ext, _status, _message, _emoji, _call_state, _platform, now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET status = EXCLUDED.status,
        status_message = COALESCE(EXCLUDED.status_message, public.user_presence.status_message),
        status_emoji = COALESCE(EXCLUDED.status_emoji, public.user_presence.status_emoji),
        call_state = EXCLUDED.call_state,
        platform = COALESCE(EXCLUDED.platform, public.user_presence.platform),
        organization_id = COALESCE(EXCLUDED.organization_id, public.user_presence.organization_id),
        extension = COALESCE(EXCLUDED.extension, public.user_presence.extension),
        last_seen_at = now(),
        updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.mark_voicemail_read(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.pbx_voicemails SET read_at = now()
   WHERE id = _id
     AND organization_id IN (SELECT public.current_user_org_ids());
$$;

CREATE OR REPLACE FUNCTION public.set_call_notes(_call_id uuid, _notes text, _tags text[] DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.pbx_call_records SET notes = _notes, tags = COALESCE(_tags, tags)
   WHERE id = _call_id
     AND organization_id IN (SELECT public.current_user_org_ids());
$$;

CREATE OR REPLACE FUNCTION public.toggle_queue_pause(_queue_id text, _paused boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.pbx_queue_agent_state SET paused = _paused, updated_at = now()
   WHERE user_id = auth.uid() AND queue_id = _queue_id;
$$;

-- =====================================================
-- REALTIME
-- =====================================================
ALTER TABLE public.org_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.user_presence REPLICA IDENTITY FULL;
ALTER TABLE public.pbx_voicemails REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_channels; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_voicemails; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_records; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_softphone_users; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
