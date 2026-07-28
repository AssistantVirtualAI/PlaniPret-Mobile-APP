ALTER TABLE public.planipret_call_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_call_sessions;