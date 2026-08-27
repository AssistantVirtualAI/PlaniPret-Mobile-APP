CREATE TABLE public.planipret_commission_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  years integer[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'completed',
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_imports TO authenticated;
GRANT ALL ON public.planipret_commission_imports TO service_role;
ALTER TABLE public.planipret_commission_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_imports_admin_all" ON public.planipret_commission_imports
FOR ALL TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "pp_imports_member_read" ON public.planipret_commission_imports
FOR SELECT TO authenticated
USING (public.is_planipret_member(auth.uid()));

CREATE TABLE public.planipret_commission_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  loan_amt numeric NOT NULL DEFAULT 0,
  primary_client_name text,
  secondary_client_name text,
  institution text,
  financial_inst_id text,
  is_adjustment text,
  points numeric,
  buy_down numeric,
  amount numeric NOT NULL DEFAULT 0,
  mortgage_type text,
  term text,
  agent_name text,
  target_name text,
  date_trans date,
  commission_type text,
  split_type text,
  agent_company text,
  cabinet text,
  source_row integer NOT NULL DEFAULT 0,
  fiscal_year integer,
  ym_key text,
  broker_user_id uuid,
  import_batch_id uuid REFERENCES public.planipret_commission_imports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_register TO authenticated;
GRANT ALL ON public.planipret_commission_register TO service_role;
ALTER TABLE public.planipret_commission_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_register_admin_all" ON public.planipret_commission_register
FOR ALL TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "pp_register_own_read" ON public.planipret_commission_register
FOR SELECT TO authenticated
USING (broker_user_id = auth.uid());

CREATE INDEX idx_pp_register_broker ON public.planipret_commission_register (broker_user_id);
CREATE INDEX idx_pp_register_year ON public.planipret_commission_register (fiscal_year);
CREATE INDEX idx_pp_register_date ON public.planipret_commission_register (date_trans);
CREATE INDEX idx_pp_register_agent ON public.planipret_commission_register (agent_name);
CREATE INDEX idx_pp_register_order ON public.planipret_commission_register (source_row);

CREATE TRIGGER trg_pp_register_updated_at
BEFORE UPDATE ON public.planipret_commission_register
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE TRIGGER trg_pp_imports_updated_at
BEFORE UPDATE ON public.planipret_commission_imports
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();