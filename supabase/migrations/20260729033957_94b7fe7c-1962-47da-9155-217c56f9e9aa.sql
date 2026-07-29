CREATE TABLE IF NOT EXISTS public.planipret_maestro_cdr_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE,
  user_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_status integer,
  last_reason text,
  succeeded_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_maestro_cdr_retries TO authenticated;
GRANT ALL ON public.planipret_maestro_cdr_retries TO service_role;

ALTER TABLE public.planipret_maestro_cdr_retries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins manage cdr retries"
  ON public.planipret_maestro_cdr_retries
  FOR ALL
  TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pp_cdr_retries_due
  ON public.planipret_maestro_cdr_retries (status, next_attempt_at);

CREATE TRIGGER trg_pp_cdr_retries_updated_at
  BEFORE UPDATE ON public.planipret_maestro_cdr_retries
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();