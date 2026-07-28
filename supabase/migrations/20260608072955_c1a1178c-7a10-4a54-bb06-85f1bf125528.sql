
ALTER TABLE public.org_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.org_chat_channels REPLICA IDENTITY FULL;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='org_chat_messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_messages';
  END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='org_chat_channels';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_channels';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_general_channel(_org_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.org_chat_channels
   WHERE organization_id = _org_id AND name = 'general' AND channel_type = 'public'
   LIMIT 1;
  IF _id IS NULL THEN
    INSERT INTO public.org_chat_channels(organization_id, name, description, channel_type, created_by, members)
    VALUES (_org_id, 'general', 'Main channel', 'public', _user_id, ARRAY[_user_id]::uuid[])
    RETURNING id INTO _id;
  END IF;
  RETURN _id;
END;
$$;
