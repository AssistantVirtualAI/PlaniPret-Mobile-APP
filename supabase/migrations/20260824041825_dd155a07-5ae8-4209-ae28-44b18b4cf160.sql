CREATE TABLE public.planipret_commission_live_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  broker_user_id uuid,
  broker_label text,
  maestro_broker_id text,
  agent_name text,
  date_trans date,
  fiscal_year integer,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_comm_cache_year ON public.planipret_commission_live_cache (fiscal_year);
CREATE INDEX idx_pp_comm_cache_broker ON public.planipret_commission_live_cache (broker_user_id);
CREATE INDEX idx_pp_comm_cache_agent ON public.planipret_commission_live_cache (agent_name);
GRANT SELECT ON public.planipret_commission_live_cache TO authenticated;
GRANT ALL ON public.planipret_commission_live_cache TO service_role;
ALTER TABLE public.planipret_commission_live_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp members read commission cache"
  ON public.planipret_commission_live_cache FOR SELECT TO authenticated
  USING (public.is_planipret_member(auth.uid()));

CREATE TABLE public.planipret_commission_sync_diag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id uuid NOT NULL UNIQUE,
  broker_label text,
  broker_email text,
  maestro_broker_id text,
  connected boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  reason text,
  http_status integer,
  rows_count integer NOT NULL DEFAULT 0,
  source text,
  last_ok_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planipret_commission_sync_diag TO authenticated;
GRANT ALL ON public.planipret_commission_sync_diag TO service_role;
ALTER TABLE public.planipret_commission_sync_diag ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp members read commission diag"
  ON public.planipret_commission_sync_diag FOR SELECT TO authenticated
  USING (public.is_planipret_member(auth.uid()));

CREATE TABLE public.planipret_commission_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  brokers_total integer NOT NULL DEFAULT 0,
  brokers_connected integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  admin_token_used boolean NOT NULL DEFAULT false,
  trigger_source text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planipret_commission_sync_runs TO authenticated;
GRANT ALL ON public.planipret_commission_sync_runs TO service_role;
ALTER TABLE public.planipret_commission_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp members read commission runs"
  ON public.planipret_commission_sync_runs FOR SELECT TO authenticated
  USING (public.is_planipret_member(auth.uid()));

CREATE TRIGGER pp_comm_cache_touch BEFORE UPDATE ON public.planipret_commission_live_cache
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();
CREATE TRIGGER pp_comm_diag_touch BEFORE UPDATE ON public.planipret_commission_sync_diag
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();
CREATE TRIGGER pp_comm_runs_touch BEFORE UPDATE ON public.planipret_commission_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();