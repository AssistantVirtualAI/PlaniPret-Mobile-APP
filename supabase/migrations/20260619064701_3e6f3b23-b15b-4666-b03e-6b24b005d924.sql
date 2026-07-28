DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.pbx_queue_agent_state'::regclass AND polname='users delete own queue state') THEN
    EXECUTE 'CREATE POLICY "users delete own queue state" ON public.pbx_queue_agent_state FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pbx_queue_agent_state') THEN
    EXECUTE 'ALTER TABLE public.pbx_queue_agent_state REPLICA IDENTITY FULL';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_queue_agent_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='org_chat_messages') THEN
    EXECUTE 'ALTER TABLE public.org_chat_messages REPLICA IDENTITY FULL';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chat_messages';
  END IF;
END $$;