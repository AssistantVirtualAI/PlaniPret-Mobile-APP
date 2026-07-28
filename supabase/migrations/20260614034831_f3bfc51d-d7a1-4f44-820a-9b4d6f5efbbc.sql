ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_sms_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_sms_messages;
ALTER TABLE public.pbx_sms_threads REPLICA IDENTITY FULL;
ALTER TABLE public.pbx_sms_messages REPLICA IDENTITY FULL;