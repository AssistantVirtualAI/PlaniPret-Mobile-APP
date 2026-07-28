
-- Single source of truth for broker activation counts.
CREATE OR REPLACE VIEW public.planipret_broker_stats AS
SELECT
  COUNT(*)::int                                                            AS total_courtiers,
  COUNT(*) FILTER (WHERE mobile_app_enabled = true)::int                   AS app_mobile_active,
  COUNT(*) FILTER (WHERE voice_agent_enabled = true)::int                  AS agent_ia_active,
  COUNT(*) FILTER (WHERE maestro_connected = true)::int                    AS maestro_connected,
  COUNT(*) FILTER (WHERE ms365_access_token IS NOT NULL)::int              AS ms365_connected,
  COUNT(*) FILTER (WHERE ns_linked = true)::int                            AS ns_linked
FROM public.planipret_profiles;

GRANT SELECT ON public.planipret_broker_stats TO authenticated;
GRANT SELECT ON public.planipret_broker_stats TO service_role;

-- Make sure Overview/Reports can listen to toggle flips in real time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'planipret_profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_profiles';
  END IF;
END $$;

ALTER TABLE public.planipret_profiles REPLICA IDENTITY FULL;
