CREATE TABLE public.planipret_call_job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid,
  deal_id text,
  idempotency_key text NOT NULL,
  step text NOT NULL DEFAULT 'full_sync',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  locked_by text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX planipret_call_job_queue_idem_key ON public.planipret_call_job_queue (idempotency_key);
CREATE INDEX planipret_call_job_queue_pickup ON public.planipret_call_job_queue (status, next_run_at) WHERE status = 'pending';
CREATE INDEX planipret_call_job_queue_call ON public.planipret_call_job_queue (call_id);
CREATE INDEX planipret_call_job_queue_deal ON public.planipret_call_job_queue (deal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_call_job_queue TO authenticated;
GRANT ALL ON public.planipret_call_job_queue TO service_role;

ALTER TABLE public.planipret_call_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brokers see own queue jobs"
  ON public.planipret_call_job_queue
  FOR SELECT
  TO authenticated
  USING (call_id IN (
    SELECT c.id FROM public.planipret_phone_calls c
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "admins manage all queue jobs"
  ON public.planipret_call_job_queue
  FOR ALL
  TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.planipret_job_state (
  job_name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  paused_reason text,
  paused_at timestamptz,
  locked_until timestamptz,
  locked_by text,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_job_state TO authenticated;
GRANT ALL ON public.planipret_job_state TO service_role;

ALTER TABLE public.planipret_job_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage job state"
  ON public.planipret_job_state
  FOR ALL
  TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.planipret_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER planipret_call_job_queue_touch
  BEFORE UPDATE ON public.planipret_call_job_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE TRIGGER planipret_job_state_touch
  BEFORE UPDATE ON public.planipret_job_state
  FOR EACH ROW
  EXECUTE FUNCTION public.planipret_set_updated_at();