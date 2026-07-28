ALTER TABLE public.planipret_phone_calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='planipret_phone_calls') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_phone_calls';
  END IF;
END $$;