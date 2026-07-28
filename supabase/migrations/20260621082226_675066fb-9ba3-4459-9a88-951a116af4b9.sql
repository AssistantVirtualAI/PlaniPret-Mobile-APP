ALTER TABLE public.planipret_phone_calls REPLICA IDENTITY FULL;
ALTER TABLE public.planipret_phone_messages REPLICA IDENTITY FULL;
ALTER TABLE public.planipret_voicemails REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_phone_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_phone_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_voicemails;