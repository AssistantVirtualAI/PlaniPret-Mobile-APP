
-- 1) Team chat messages
CREATE TABLE public.planipret_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to uuid REFERENCES public.planipret_team_messages(id) ON DELETE SET NULL,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_team_messages TO authenticated;
GRANT ALL ON public.planipret_team_messages TO service_role;

ALTER TABLE public.planipret_team_messages ENABLE ROW LEVEL SECURITY;

-- Any planipret broker (a row in planipret_profiles linked to auth.uid()) may read team messages
CREATE POLICY "Brokers can read team messages"
  ON public.planipret_team_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Brokers can insert their own team messages"
  ON public.planipret_team_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.id = sender_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Senders can update their own team messages"
  ON public.planipret_team_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.id = sender_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Senders can delete their own team messages"
  ON public.planipret_team_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.id = sender_id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX idx_pp_team_msgs_channel_created ON public.planipret_team_messages(channel, created_at DESC);
CREATE INDEX idx_pp_team_msgs_reply_to ON public.planipret_team_messages(reply_to);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pp_team_messages_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pp_team_messages_updated_at
  BEFORE UPDATE ON public.planipret_team_messages
  FOR EACH ROW EXECUTE FUNCTION public.pp_team_messages_set_updated_at();

-- 2) AVA conversations
CREATE TABLE public.planipret_ava_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  message text NOT NULL,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.planipret_ava_conversations TO authenticated;
GRANT ALL ON public.planipret_ava_conversations TO service_role;

ALTER TABLE public.planipret_ava_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own AVA conversations"
  ON public.planipret_ava_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert their own AVA conversations"
  ON public.planipret_ava_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete their own AVA conversations"
  ON public.planipret_ava_conversations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_pp_ava_conv_user_created ON public.planipret_ava_conversations(user_id, created_at DESC);
