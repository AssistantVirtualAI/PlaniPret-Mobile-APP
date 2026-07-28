-- Phase 1: Maestro pipeline schema completion

-- Additional columns on planipret_phone_calls
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS maestro_client_name text,
  ADD COLUMN IF NOT EXISTS maestro_client_company text,
  ADD COLUMN IF NOT EXISTS maestro_mortgage_stage text,
  ADD COLUMN IF NOT EXISTS transcript_confidence float,
  ADD COLUMN IF NOT EXISTS transcript_source text,
  ADD COLUMN IF NOT EXISTS pipeline_step text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pipeline_error text,
  ADD COLUMN IF NOT EXISTS pipeline_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS maestro_tasks_created jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS maestro_appointments_created jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Additional columns on planipret_profiles
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS maestro_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maestro_last_sync_at timestamptz;

-- planipret_maestro_clients cache table
CREATE TABLE IF NOT EXISTS public.planipret_maestro_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  maestro_client_id text NOT NULL,
  phone_e164 text,
  first_name text,
  last_name text,
  full_name text,
  company text,
  email text,
  mortgage_stage text,
  preferred_lang text DEFAULT 'fr',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_contact_at timestamptz,
  lead_score_avg float,
  total_calls int NOT NULL DEFAULT 0,
  cached_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pp_maestro_clients_user_phone
  ON public.planipret_maestro_clients (user_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_maestro_clients_phone ON public.planipret_maestro_clients (phone_e164);
CREATE INDEX IF NOT EXISTS idx_pp_maestro_clients_mid ON public.planipret_maestro_clients (maestro_client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_maestro_clients TO authenticated;
GRANT ALL ON public.planipret_maestro_clients TO service_role;

ALTER TABLE public.planipret_maestro_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own maestro client cache"
ON public.planipret_maestro_clients
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- planipret_pipeline_logs table
CREATE TABLE IF NOT EXISTS public.planipret_pipeline_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.planipret_phone_calls(id) ON DELETE CASCADE,
  user_id uuid,
  step text NOT NULL,
  status text NOT NULL,
  duration_ms int,
  payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_pipeline_logs_call ON public.planipret_pipeline_logs (call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_pipeline_logs_user ON public.planipret_pipeline_logs (user_id, created_at DESC);

GRANT SELECT ON public.planipret_pipeline_logs TO authenticated;
GRANT ALL ON public.planipret_pipeline_logs TO service_role;

ALTER TABLE public.planipret_pipeline_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own pipeline logs"
ON public.planipret_pipeline_logs
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- planipret_maestro_sync_log table (service-role only)
CREATE TABLE IF NOT EXISTS public.planipret_maestro_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text,
  maestro_endpoint text,
  request_body jsonb,
  response_status int,
  response_body jsonb,
  duration_ms int,
  success boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_maestro_sync_log_created ON public.planipret_maestro_sync_log (created_at DESC);

GRANT ALL ON public.planipret_maestro_sync_log TO service_role;
ALTER TABLE public.planipret_maestro_sync_log ENABLE ROW LEVEL SECURITY;
-- no policy -> only service_role can access