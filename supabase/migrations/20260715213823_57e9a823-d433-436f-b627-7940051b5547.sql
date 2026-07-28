ALTER PUBLICATION supabase_realtime DROP TABLE public.planipret_profiles;
ALTER TABLE public.planipret_profiles REPLICA IDENTITY DEFAULT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_profiles;