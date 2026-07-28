
-- Broaden SELECT policies so any Lemtel staff (org_admin via user_roles, lemtel_admin, or lemtel_member) can read PBX data
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pbx_extensions','pbx_softphone_users','pbx_call_records','pbx_call_recordings',
    'pbx_voicemails','pbx_call_queues','pbx_ring_groups','pbx_ivrs','pbx_devices',
    'pbx_sync_jobs','pbx_gateways','pbx_destinations','pbx_conferences','pbx_hold_music',
    'pbx_dialplans','pbx_time_conditions','pbx_queue_agents','pbx_call_transcripts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS lemtel_staff_select ON public.%I', t);
      EXECUTE format($f$
        CREATE POLICY lemtel_staff_select ON public.%I
        FOR SELECT TO authenticated
        USING (
          public.is_super_admin(auth.uid())
          OR public.is_lemtel_admin(auth.uid())
          OR public.is_lemtel_member(auth.uid())
        )
      $f$, t);
    END IF;
  END LOOP;
END $$;
