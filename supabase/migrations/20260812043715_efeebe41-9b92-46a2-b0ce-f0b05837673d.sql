ALTER TABLE public.planipret_commission_register
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS maestro_broker_id text,
  ADD COLUMN IF NOT EXISTS agent_key text,
  ADD COLUMN IF NOT EXISTS match_method text;

CREATE INDEX IF NOT EXISTS idx_pp_register_agent_key ON public.planipret_commission_register (agent_key);

ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.planipret_profiles
SET first_name = COALESCE(first_name, NULLIF(split_part(trim(full_name), ' ', 1), '')),
    last_name = COALESCE(last_name, NULLIF(trim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1)), ''))
WHERE full_name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

CREATE TABLE IF NOT EXISTS public.planipret_commission_broker_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  raw_name text NOT NULL,
  broker_user_id uuid,
  maestro_broker_id text,
  first_name text,
  last_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_commission_broker_aliases TO authenticated;
GRANT ALL ON public.planipret_commission_broker_aliases TO service_role;

ALTER TABLE public.planipret_commission_broker_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_alias_admin_all" ON public.planipret_commission_broker_aliases
  FOR ALL TO authenticated
  USING (is_planipret_admin(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_planipret_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "pp_alias_own_read" ON public.planipret_commission_broker_aliases
  FOR SELECT TO authenticated
  USING (broker_user_id = auth.uid());

CREATE TRIGGER trg_pp_alias_updated_at
  BEFORE UPDATE ON public.planipret_commission_broker_aliases
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();