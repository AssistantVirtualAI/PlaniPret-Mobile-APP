
CREATE TABLE IF NOT EXISTS public.pbx_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pbx_sync_jobs TO authenticated;
GRANT ALL ON public.pbx_sync_jobs TO service_role;

ALTER TABLE public.pbx_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sync jobs"
  ON public.pbx_sync_jobs FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));

CREATE INDEX IF NOT EXISTS idx_pbx_sync_jobs_org_started
  ON public.pbx_sync_jobs (organization_id, started_at DESC);

ALTER TABLE public.pbx_sync_jobs REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_sync_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_extensions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_records; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_queues; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_devices; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_voicemails; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
