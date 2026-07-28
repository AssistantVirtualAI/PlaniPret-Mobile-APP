DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pbx_ivrs','pbx_ivr_options','pbx_ivr_audio',
    'pbx_call_queues','pbx_queue_agents','pbx_queue_agent_state',
    'pbx_ring_groups','pbx_extensions',
    'pbx_voicemails','pbx_call_records'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;