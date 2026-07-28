DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lemtel_cdrs_cache') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lemtel_cdrs_cache';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='phone_numbers') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.phone_numbers';
  END IF;
END $$;

ALTER TABLE public.lemtel_cdrs_cache REPLICA IDENTITY FULL;
ALTER TABLE public.phone_numbers REPLICA IDENTITY FULL;