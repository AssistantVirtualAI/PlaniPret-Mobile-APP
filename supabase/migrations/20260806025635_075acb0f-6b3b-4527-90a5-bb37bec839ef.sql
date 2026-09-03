ALTER TABLE public.planipret_commission_stats
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.pp_commission_stats_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pp_commission_stats_touch ON public.planipret_commission_stats;
CREATE TRIGGER pp_commission_stats_touch
BEFORE UPDATE ON public.planipret_commission_stats
FOR EACH ROW EXECUTE FUNCTION public.pp_commission_stats_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_stats TO authenticated;
GRANT ALL ON public.planipret_commission_stats TO service_role;

DROP POLICY IF EXISTS pcs_admin_all ON public.planipret_commission_stats;
CREATE POLICY pcs_admin_all ON public.planipret_commission_stats
  FOR ALL TO authenticated
  USING (is_planipret_admin(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_planipret_admin(auth.uid()) OR is_super_admin(auth.uid()));