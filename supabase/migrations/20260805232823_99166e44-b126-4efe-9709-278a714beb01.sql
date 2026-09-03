CREATE TABLE public.planipret_commission_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_name text NOT NULL,
  broker_user_id uuid,
  fiscal_year integer NOT NULL DEFAULT 2026,
  section text NOT NULL,
  dimension text,
  sub_dimension text,
  rank integer,
  cy_volume numeric DEFAULT 0,
  py_volume numeric DEFAULT 0,
  cy_deals integer DEFAULT 0,
  py_deals integer DEFAULT 0,
  cy_commission numeric DEFAULT 0,
  py_commission numeric DEFAULT 0,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_commission_stats_broker ON public.planipret_commission_stats (broker_name);
CREATE INDEX idx_commission_stats_user ON public.planipret_commission_stats (broker_user_id);
CREATE INDEX idx_commission_stats_section ON public.planipret_commission_stats (section, fiscal_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_stats TO authenticated;
GRANT ALL ON public.planipret_commission_stats TO service_role;

ALTER TABLE public.planipret_commission_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcs_admin_all" ON public.planipret_commission_stats
FOR ALL TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "pcs_broker_read_own" ON public.planipret_commission_stats
FOR SELECT TO authenticated
USING (
  broker_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.planipret_profiles p
    WHERE p.user_id = auth.uid()
      AND lower(trim(coalesce(p.full_name, ''))) = lower(trim(planipret_commission_stats.broker_name))
  )
);

CREATE TRIGGER trg_pcs_updated_at
BEFORE UPDATE ON public.planipret_commission_stats
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();