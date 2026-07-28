
-- Pinned messages (richer than the array on channels)
CREATE TABLE IF NOT EXISTS public.org_chat_message_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.org_chat_messages(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.org_chat_message_pins TO authenticated;
GRANT ALL ON public.org_chat_message_pins TO service_role;
ALTER TABLE public.org_chat_message_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read pins" ON public.org_chat_message_pins
  FOR SELECT TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org members create pins" ON public.org_chat_message_pins
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()) AND pinned_by = auth.uid());
CREATE POLICY "org members remove pins" ON public.org_chat_message_pins
  FOR DELETE TO authenticated USING (organization_id IN (SELECT public.current_user_org_ids()));

-- Ensure org_chat_reads exists (was referenced earlier but not visible here)
CREATE TABLE IF NOT EXISTS public.org_chat_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_reads TO authenticated;
GRANT ALL ON public.org_chat_reads TO service_role;
ALTER TABLE public.org_chat_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own reads" ON public.org_chat_reads;
CREATE POLICY "users manage own reads" ON public.org_chat_reads
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER TABLE public.org_chat_message_pins REPLICA IDENTITY FULL;
ALTER TABLE public.org_chat_reads REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_message_pins; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_reads; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- RPC: create group chat
CREATE OR REPLACE FUNCTION public.create_group_chat(_name text, _member_ids uuid[])
RETURNS public.org_chat_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _ch public.org_chat_channels;
  _members uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT organization_id INTO _org FROM public.organization_members WHERE user_id = _uid LIMIT 1;
  IF _org IS NULL THEN SELECT org_id INTO _org FROM public.org_members WHERE user_id = _uid LIMIT 1; END IF;
  IF _org IS NULL THEN SELECT organization_id INTO _org FROM public.pbx_softphone_users WHERE portal_user_id = _uid LIMIT 1; END IF;
  IF _org IS NULL THEN RAISE EXCEPTION 'no_org'; END IF;
  _members := ARRAY(SELECT DISTINCT unnest(array_append(COALESCE(_member_ids, ARRAY[]::uuid[]), _uid)));
  INSERT INTO public.org_chat_channels(organization_id, name, channel_type, created_by, members, description)
  VALUES (_org, COALESCE(NULLIF(trim(_name),''),'group'), 'private', _uid, _members, 'Group chat')
  RETURNING * INTO _ch;
  RETURN _ch;
END $$;

-- RPC: unread counts for current user
CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE (channel_id uuid, unread_count bigint, last_message_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH chans AS (
    SELECT c.id
    FROM public.org_chat_channels c
    WHERE c.organization_id IN (SELECT public.current_user_org_ids())
      AND (c.channel_type = 'public' OR auth.uid() = ANY(c.members))
  ),
  reads AS (
    SELECT r.channel_id, r.last_read_at FROM public.org_chat_reads r WHERE r.user_id = auth.uid()
  )
  SELECT m.channel_id,
         COUNT(*)::bigint AS unread_count,
         MAX(m.created_at) AS last_message_at
  FROM public.org_chat_messages m
  JOIN chans ch ON ch.id = m.channel_id
  LEFT JOIN reads r ON r.channel_id = m.channel_id
  WHERE m.sender_id IS DISTINCT FROM auth.uid()
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
  GROUP BY m.channel_id
$$;

-- RPC: mark channel read
CREATE OR REPLACE FUNCTION public.mark_channel_read(_channel_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.org_chat_reads(user_id, channel_id, last_read_at)
  VALUES (auth.uid(), _channel_id, now())
  ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
$$;

-- RPC: pin / unpin
CREATE OR REPLACE FUNCTION public.pin_chat_message(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _msg record;
BEGIN
  SELECT channel_id, organization_id INTO _msg FROM public.org_chat_messages WHERE id = _message_id;
  IF _msg IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  INSERT INTO public.org_chat_message_pins(organization_id, channel_id, message_id, pinned_by)
  VALUES (_msg.organization_id, _msg.channel_id, _message_id, auth.uid())
  ON CONFLICT (channel_id, message_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.unpin_chat_message(_message_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.org_chat_message_pins WHERE message_id = _message_id;
$$;
