
-- ============ MESSAGE COLUMNS ============
ALTER TABLE public.org_chat_messages
  ADD COLUMN IF NOT EXISTS edit_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by uuid,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- ============ READ RECEIPTS ============
CREATE TABLE IF NOT EXISTS public.org_chat_message_receipts (
  message_id uuid NOT NULL REFERENCES public.org_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_receipts_channel_user ON public.org_chat_message_receipts(channel_id, user_id);
GRANT SELECT, INSERT ON public.org_chat_message_receipts TO authenticated;
GRANT ALL ON public.org_chat_message_receipts TO service_role;
ALTER TABLE public.org_chat_message_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receipts_select" ON public.org_chat_message_receipts;
CREATE POLICY "receipts_select" ON public.org_chat_message_receipts FOR SELECT TO authenticated
  USING (public.can_access_chat_channel(channel_id, auth.uid()));
DROP POLICY IF EXISTS "receipts_insert" ON public.org_chat_message_receipts;
CREATE POLICY "receipts_insert" ON public.org_chat_message_receipts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_chat_channel(channel_id, auth.uid()));

ALTER TABLE public.org_chat_message_receipts REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_message_receipts; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============ EDIT HISTORY ============
CREATE TABLE IF NOT EXISTS public.org_chat_message_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.org_chat_messages(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_content text,
  new_content text,
  edited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edits_message ON public.org_chat_message_edits(message_id, edited_at DESC);
GRANT SELECT, INSERT ON public.org_chat_message_edits TO authenticated;
GRANT ALL ON public.org_chat_message_edits TO service_role;
ALTER TABLE public.org_chat_message_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edits_select" ON public.org_chat_message_edits;
CREATE POLICY "edits_select" ON public.org_chat_message_edits FOR SELECT TO authenticated
  USING (
    edited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_chat_messages m
      WHERE m.id = message_id
        AND (m.sender_id = auth.uid()
             OR public.has_role(auth.uid(), m.organization_id, 'org_admin'::app_role)
             OR public.is_super_admin(auth.uid()))
    )
  );

-- Trigger: record edits on content change
CREATE OR REPLACE FUNCTION public.org_chat_record_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.content IS DISTINCT FROM NEW.content AND NEW.message_type <> 'deleted' THEN
    INSERT INTO public.org_chat_message_edits(message_id, edited_by, previous_content, new_content)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.sender_id), OLD.content, NEW.content);
    NEW.edit_count := COALESCE(OLD.edit_count, 0) + 1;
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_chat_record_edit ON public.org_chat_messages;
CREATE TRIGGER trg_org_chat_record_edit BEFORE UPDATE ON public.org_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.org_chat_record_edit();

-- ============ MODERATION: BLOCKS ============
CREATE TABLE IF NOT EXISTS public.org_chat_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CHECK (blocker_id <> blocked_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.org_chat_blocks TO authenticated;
GRANT ALL ON public.org_chat_blocks TO service_role;
ALTER TABLE public.org_chat_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocks_own" ON public.org_chat_blocks;
CREATE POLICY "blocks_own" ON public.org_chat_blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- ============ MODERATION: REPORTS ============
CREATE TABLE IF NOT EXISTS public.org_chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.org_chat_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_org_status ON public.org_chat_reports(organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.org_chat_reports TO authenticated;
GRANT ALL ON public.org_chat_reports TO service_role;
ALTER TABLE public.org_chat_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_select" ON public.org_chat_reports;
CREATE POLICY "reports_select" ON public.org_chat_reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );
DROP POLICY IF EXISTS "reports_insert" ON public.org_chat_reports;
CREATE POLICY "reports_insert" ON public.org_chat_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.can_access_chat_channel(channel_id, auth.uid()));
DROP POLICY IF EXISTS "reports_update_admin" ON public.org_chat_reports;
CREATE POLICY "reports_update_admin" ON public.org_chat_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.org_chat_reports REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============ RPCs ============

-- Mark messages read (bulk receipts up to a timestamp)
CREATE OR REPLACE FUNCTION public.mark_messages_read(_channel_id uuid, _up_to timestamptz DEFAULT now())
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_access_chat_channel(_channel_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.org_chat_message_receipts(message_id, user_id, channel_id, read_at)
  SELECT m.id, auth.uid(), m.channel_id, now()
  FROM public.org_chat_messages m
  WHERE m.channel_id = _channel_id
    AND m.created_at <= _up_to
    AND m.sender_id IS DISTINCT FROM auth.uid()
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS _n = ROW_COUNT;

  INSERT INTO public.org_chat_reads(user_id, channel_id, last_read_at)
  VALUES (auth.uid(), _channel_id, _up_to)
  ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = GREATEST(public.org_chat_reads.last_read_at, EXCLUDED.last_read_at);

  RETURN _n;
END $$;

-- Get receipts for a message (who read + when)
CREATE OR REPLACE FUNCTION public.get_message_receipts(_message_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.user_id, p.full_name, p.avatar_url, r.read_at
  FROM public.org_chat_message_receipts r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.message_id = _message_id
    AND EXISTS (
      SELECT 1 FROM public.org_chat_messages m
      WHERE m.id = _message_id AND public.can_access_chat_channel(m.channel_id, auth.uid())
    )
  ORDER BY r.read_at ASC
$$;

-- Get edit history
CREATE OR REPLACE FUNCTION public.get_message_edit_history(_message_id uuid)
RETURNS TABLE(id uuid, edited_by uuid, editor_name text, previous_content text, new_content text, edited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.edited_by, p.full_name AS editor_name, e.previous_content, e.new_content, e.edited_at
  FROM public.org_chat_message_edits e
  LEFT JOIN public.profiles p ON p.id = e.edited_by
  WHERE e.message_id = _message_id
    AND EXISTS (
      SELECT 1 FROM public.org_chat_messages m
      WHERE m.id = _message_id
        AND (m.sender_id = auth.uid()
             OR public.has_role(auth.uid(), m.organization_id, 'org_admin'::app_role)
             OR public.is_super_admin(auth.uid()))
    )
  ORDER BY e.edited_at DESC
$$;

-- Search messages (full-text + ILIKE fallback)
CREATE OR REPLACE FUNCTION public.search_chat(_q text, _limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, channel_id uuid, channel_name text, channel_type text,
  sender_id uuid, sender_name text, content text, snippet text,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT plainto_tsquery('french', coalesce(_q,'')) AS tsq)
  SELECT m.id, m.channel_id, c.name AS channel_name, c.channel_type::text,
         m.sender_id, m.sender_name, m.content,
         CASE WHEN (SELECT tsq FROM q) IS NOT NULL
              THEN ts_headline('french', coalesce(m.content,''), (SELECT tsq FROM q),
                               'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=20,MinWords=5')
              ELSE left(coalesce(m.content,''), 160)
         END AS snippet,
         m.created_at
  FROM public.org_chat_messages m
  JOIN public.org_chat_channels c ON c.id = m.channel_id
  WHERE c.organization_id IN (SELECT public.current_user_org_ids())
    AND (c.channel_type = 'public' OR auth.uid() = ANY(c.members))
    AND coalesce(_q,'') <> ''
    AND m.is_hidden = false
    AND m.message_type <> 'deleted'
    AND (
      (m.tsv @@ (SELECT tsq FROM q))
      OR m.content ILIKE '%' || _q || '%'
    )
  ORDER BY ts_rank_cd(m.tsv, (SELECT tsq FROM q)) DESC NULLS LAST, m.created_at DESC
  LIMIT GREATEST(_limit, 1)
$$;

-- Search users (directory)
CREATE OR REPLACE FUNCTION public.search_chat_users(_q text, _limit int DEFAULT 20)
RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text, extension text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH org_users AS (
    SELECT DISTINCT user_id FROM public.organization_members WHERE organization_id IN (SELECT public.current_user_org_ids())
    UNION
    SELECT DISTINCT user_id FROM public.org_members WHERE org_id IN (SELECT public.current_user_org_ids())
  )
  SELECT p.id, p.full_name, p.email, p.avatar_url,
         (SELECT s.extension FROM public.pbx_softphone_users s WHERE s.portal_user_id = p.id LIMIT 1)
  FROM public.profiles p
  JOIN org_users ou ON ou.user_id = p.id
  WHERE coalesce(_q,'') <> ''
    AND (
      p.full_name ILIKE '%' || _q || '%'
      OR p.email ILIKE '%' || _q || '%'
    )
  ORDER BY p.full_name NULLS LAST
  LIMIT GREATEST(_limit, 1)
$$;

-- Hide / unhide message (admin only)
CREATE OR REPLACE FUNCTION public.hide_chat_message(_message_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.org_chat_messages WHERE id = _message_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.has_role(auth.uid(), _org, 'org_admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.org_chat_messages
    SET is_hidden = true, hidden_by = auth.uid(), hidden_reason = _reason, hidden_at = now()
    WHERE id = _message_id;
END $$;

CREATE OR REPLACE FUNCTION public.unhide_chat_message(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.org_chat_messages WHERE id = _message_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.has_role(auth.uid(), _org, 'org_admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.org_chat_messages
    SET is_hidden = false, hidden_by = NULL, hidden_reason = NULL, hidden_at = NULL
    WHERE id = _message_id;
END $$;
