
-- 1. Realtime: add planipret_team_messages (other 3 already in publication)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'planipret_team_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_team_messages;
  END IF;
END $$;

-- 2. Audit helper — checks which planipret tables are in the realtime publication
CREATE OR REPLACE FUNCTION public.pp_audit_realtime_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_agg(tablename ORDER BY tablename)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename LIKE 'planipret_%'
$$;

REVOKE ALL ON FUNCTION public.pp_audit_realtime_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pp_audit_realtime_check() TO authenticated, service_role;

-- 3. Persist manual checklist state per workspace (defaults to {} so existing
-- rows keep working). Used by /planipret/admin/audit-checklist.
ALTER TABLE public.planipret_settings
  ADD COLUMN IF NOT EXISTS manual_checklist_state jsonb NOT NULL DEFAULT '{}'::jsonb;
