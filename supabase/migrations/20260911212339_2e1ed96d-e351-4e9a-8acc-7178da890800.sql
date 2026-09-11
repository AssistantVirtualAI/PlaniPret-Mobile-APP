CREATE TABLE public.planipret_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  contract_number text,
  broker_profile_id uuid NOT NULL,
  broker_name text,
  maestro_status text,
  status text,
  loan_amt numeric,
  rate text,
  date_closing date,
  date_maturity date,
  clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text,
  last_activity_at timestamptz,
  calls_total integer NOT NULL DEFAULT 0,
  calls_synced integer NOT NULL DEFAULT 0,
  with_transcript integer NOT NULL DEFAULT 0,
  with_summary integer NOT NULL DEFAULT 0,
  with_coaching integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, broker_profile_id)
);

GRANT SELECT ON public.planipret_contracts TO authenticated;
GRANT ALL ON public.planipret_contracts TO service_role;

ALTER TABLE public.planipret_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp admins read all contracts"
ON public.planipret_contracts FOR SELECT TO authenticated
USING (is_planipret_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "pp brokers read own contracts"
ON public.planipret_contracts FOR SELECT TO authenticated
USING (broker_profile_id = auth.uid());

CREATE INDEX idx_pp_contracts_broker ON public.planipret_contracts (broker_profile_id);
CREATE INDEX idx_pp_contracts_activity ON public.planipret_contracts (last_activity_at DESC);

CREATE TRIGGER pp_contracts_touch BEFORE UPDATE ON public.planipret_contracts
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();