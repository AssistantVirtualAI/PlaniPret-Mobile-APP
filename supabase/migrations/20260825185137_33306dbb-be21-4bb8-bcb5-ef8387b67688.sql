CREATE TABLE public.planipret_commission_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  profile_id uuid,
  broker_user_id uuid,
  broker_name text,
  maestro_broker_id text,
  fiscal_year integer NOT NULL,
  source_rows integer NOT NULL DEFAULT 0,
  source_amount numeric NOT NULL DEFAULT 0,
  source_loan numeric NOT NULL DEFAULT 0,
  db_rows integer NOT NULL DEFAULT 0,
  db_amount numeric NOT NULL DEFAULT 0,
  db_loan numeric NOT NULL DEFAULT 0,
  rows_diff integer NOT NULL DEFAULT 0,
  amount_diff numeric NOT NULL DEFAULT 0,
  loan_diff numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_comm_recon_broker ON public.planipret_commission_reconciliation (broker_user_id, fiscal_year, created_at DESC);
CREATE INDEX idx_pp_comm_recon_run ON public.planipret_commission_reconciliation (run_id);

GRANT SELECT ON public.planipret_commission_reconciliation TO authenticated;
GRANT ALL ON public.planipret_commission_reconciliation TO service_role;

ALTER TABLE public.planipret_commission_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all reconciliations"
ON public.planipret_commission_reconciliation FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()));

CREATE POLICY "Brokers read their reconciliations"
ON public.planipret_commission_reconciliation FOR SELECT TO authenticated
USING (broker_user_id = auth.uid());

CREATE TRIGGER trg_pp_comm_recon_updated_at
BEFORE UPDATE ON public.planipret_commission_reconciliation
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();