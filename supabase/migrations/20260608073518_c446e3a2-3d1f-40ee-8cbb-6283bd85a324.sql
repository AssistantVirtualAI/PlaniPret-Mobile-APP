
-- ============ Phase 4b: Threads + Search ============
ALTER TABLE public.org_chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.org_chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS tsv tsvector;

CREATE INDEX IF NOT EXISTS idx_org_chat_messages_parent ON public.org_chat_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_org_chat_messages_tsv ON public.org_chat_messages USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_org_chat_messages_channel_created ON public.org_chat_messages(channel_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.org_chat_messages_tsv_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tsv := to_tsvector('french', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_org_chat_messages_tsv ON public.org_chat_messages;
CREATE TRIGGER trg_org_chat_messages_tsv BEFORE INSERT OR UPDATE OF content
  ON public.org_chat_messages FOR EACH ROW EXECUTE FUNCTION public.org_chat_messages_tsv_update();
UPDATE public.org_chat_messages SET tsv = to_tsvector('french', coalesce(content,'')) WHERE tsv IS NULL;

CREATE OR REPLACE FUNCTION public.org_chat_bump_thread_counters()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_message_id IS NOT NULL THEN
    UPDATE public.org_chat_messages
      SET reply_count = reply_count + 1, last_reply_at = NEW.created_at
      WHERE id = NEW.parent_message_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_message_id IS NOT NULL THEN
    UPDATE public.org_chat_messages
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.parent_message_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_org_chat_bump_thread ON public.org_chat_messages;
CREATE TRIGGER trg_org_chat_bump_thread AFTER INSERT OR DELETE
  ON public.org_chat_messages FOR EACH ROW EXECUTE FUNCTION public.org_chat_bump_thread_counters();

-- ============ Phase 5: Mention notifications + email prefs ============
ALTER TABLE public.user_notification_prefs
  ADD COLUMN IF NOT EXISTS email_mentions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_dm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_voicemail boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_missed_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inapp_mentions boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.notify_chat_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m text;
  mentioned uuid;
BEGIN
  IF NEW.content IS NULL THEN RETURN NEW; END IF;
  FOR m IN SELECT DISTINCT (regexp_matches(NEW.content, '@([0-9a-fA-F-]{36})', 'g'))[1]
  LOOP
    BEGIN
      mentioned := m::uuid;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
    IF mentioned = NEW.sender_id THEN CONTINUE; END IF;
    INSERT INTO public.org_notifications (organization_id, user_id, type, title, body, payload, is_read)
    VALUES (
      NEW.organization_id, mentioned, 'chat_mention',
      'You were mentioned',
      LEFT(NEW.content, 280),
      jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id),
      false
    );
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_chat_mentions ON public.org_chat_messages;
CREATE TRIGGER trg_notify_chat_mentions AFTER INSERT ON public.org_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_mentions();

-- ============ Phase 6: Appointment reminders ============
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS host_user_id uuid,
  ADD COLUMN IF NOT EXISTS host_kind text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS location_type text DEFAULT 'phone',
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS reminder_offsets int[] NOT NULL DEFAULT ARRAY[1440, 60],
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  offset_minutes int NOT NULL,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, offset_minutes, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_reminders TO authenticated;
GRANT ALL ON public.appointment_reminders TO service_role;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appt_reminders_org_select" ON public.appointment_reminders
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "appt_reminders_service_all" ON public.appointment_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appt ON public.appointment_reminders(appointment_id);
