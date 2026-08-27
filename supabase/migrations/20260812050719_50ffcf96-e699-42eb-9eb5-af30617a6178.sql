ALTER TABLE public.planipret_commission_register
  ADD COLUMN IF NOT EXISTS sheet_name text,
  ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS row_key text,
  ADD COLUMN IF NOT EXISTS map_status text NOT NULL DEFAULT 'ok';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_register_row_key ON public.planipret_commission_register (row_key) WHERE row_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_register_map_status ON public.planipret_commission_register (map_status);

ALTER TABLE public.planipret_commission_imports
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS sheet_names text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.planipret_commission_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('column','commission_type','broker')),
  scope text NOT NULL DEFAULT 'default',
  source_key text NOT NULL,
  source_label text,
  target_value text,
  target_user_id uuid,
  maestro_broker_id text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_commission_mappings_key
  ON public.planipret_commission_mappings (kind, scope, source_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_mappings TO authenticated;
GRANT ALL ON public.planipret_commission_mappings TO service_role;

ALTER TABLE public.planipret_commission_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_commission_mappings_admin_all"
  ON public.planipret_commission_mappings FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "pp_commission_mappings_member_read"
  ON public.planipret_commission_mappings FOR SELECT TO authenticated
  USING (public.is_planipret_member(auth.uid()));

CREATE TRIGGER pp_commission_mappings_updated_at
  BEFORE UPDATE ON public.planipret_commission_mappings
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();