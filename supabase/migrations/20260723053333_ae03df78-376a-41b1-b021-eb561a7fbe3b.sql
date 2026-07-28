
-- MS365 contacts
CREATE TABLE IF NOT EXISTS public.planipret_ms_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  graph_id text NOT NULL,
  display_name text,
  given_name text,
  surname text,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  company text,
  job_title text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, graph_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_ms_contacts_user ON public.planipret_ms_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_ms_contacts_name ON public.planipret_ms_contacts USING gin (to_tsvector('simple', coalesce(display_name,'')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ms_contacts TO authenticated;
GRANT ALL ON public.planipret_ms_contacts TO service_role;
ALTER TABLE public.planipret_ms_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ms_contacts" ON public.planipret_ms_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MS365 email messages
CREATE TABLE IF NOT EXISTS public.planipret_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  graph_id text NOT NULL,
  conversation_id text,
  folder text,
  subject text,
  from_email text,
  from_name text,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_preview text,
  body_html text,
  is_read boolean DEFAULT false,
  is_sent_by_me boolean DEFAULT false,
  has_attachments boolean DEFAULT false,
  importance text,
  sent_at timestamptz,
  received_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, graph_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_email_user_time ON public.planipret_email_messages(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_email_thread ON public.planipret_email_messages(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_pp_email_from ON public.planipret_email_messages(user_id, from_email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_email_messages TO authenticated;
GRANT ALL ON public.planipret_email_messages TO service_role;
ALTER TABLE public.planipret_email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_emails" ON public.planipret_email_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MS365 calendar events
CREATE TABLE IF NOT EXISTS public.planipret_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  graph_id text NOT NULL,
  subject text,
  body_preview text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_all_day boolean DEFAULT false,
  is_online_meeting boolean DEFAULT false,
  join_url text,
  organizer_email text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, graph_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_cal_user_time ON public.planipret_calendar_events(user_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_calendar_events TO authenticated;
GRANT ALL ON public.planipret_calendar_events TO service_role;
ALTER TABLE public.planipret_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_cal" ON public.planipret_calendar_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MS365 Teams conversations
CREATE TABLE IF NOT EXISTS public.planipret_teams_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  topic text,
  chat_type text,
  members jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_message_preview text,
  last_message_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chat_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_teams_conversations TO authenticated;
GRANT ALL ON public.planipret_teams_conversations TO service_role;
ALTER TABLE public.planipret_teams_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_teams_conv" ON public.planipret_teams_conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MS365 Teams messages
CREATE TABLE IF NOT EXISTS public.planipret_teams_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  graph_id text NOT NULL,
  from_name text,
  from_email text,
  content text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, graph_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_teams_msg_chat ON public.planipret_teams_messages(user_id, chat_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_teams_messages TO authenticated;
GRANT ALL ON public.planipret_teams_messages TO service_role;
ALTER TABLE public.planipret_teams_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_teams_msg" ON public.planipret_teams_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Sync state per resource
CREATE TABLE IF NOT EXISTS public.planipret_ms_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL,
  delta_link text,
  last_full_sync_at timestamptz,
  last_delta_sync_at timestamptz,
  status text DEFAULT 'idle',
  items_synced integer DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ms_sync_state TO authenticated;
GRANT ALL ON public.planipret_ms_sync_state TO service_role;
ALTER TABLE public.planipret_ms_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sync_state" ON public.planipret_ms_sync_state FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
