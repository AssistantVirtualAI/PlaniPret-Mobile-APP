
CREATE TABLE IF NOT EXISTS public.planipret_sync_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  step TEXT,
  processed INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planipret_sync_progress_job_idx ON public.planipret_sync_progress(job_id);
CREATE INDEX IF NOT EXISTS planipret_sync_progress_kind_idx ON public.planipret_sync_progress(kind, started_at DESC);

GRANT SELECT ON public.planipret_sync_progress TO authenticated;
GRANT ALL ON public.planipret_sync_progress TO service_role;
ALTER TABLE public.planipret_sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planipret admins read sync progress"
  ON public.planipret_sync_progress FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.planipret_ns_server_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  detail TEXT,
  endpoint TEXT,
  sample_count INT,
  last_probed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain, feature)
);

GRANT SELECT ON public.planipret_ns_server_capabilities TO authenticated;
GRANT ALL ON public.planipret_ns_server_capabilities TO service_role;
ALTER TABLE public.planipret_ns_server_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planipret admins read ns capabilities"
  ON public.planipret_ns_server_capabilities FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS planipret_sync_progress_touch ON public.planipret_sync_progress;
CREATE TRIGGER planipret_sync_progress_touch BEFORE UPDATE ON public.planipret_sync_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS planipret_ns_caps_touch ON public.planipret_ns_server_capabilities;
CREATE TRIGGER planipret_ns_caps_touch BEFORE UPDATE ON public.planipret_ns_server_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
