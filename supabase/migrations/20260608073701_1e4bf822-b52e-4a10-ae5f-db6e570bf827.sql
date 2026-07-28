
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
    INSERT INTO public.org_notifications (organization_id, recipient_user_id, level, title, body, metadata)
    VALUES (
      NEW.organization_id, mentioned, 'info',
      COALESCE(NEW.sender_name, 'Someone') || ' mentioned you',
      LEFT(NEW.content, 280),
      jsonb_build_object('type','chat_mention','channel_id', NEW.channel_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;
