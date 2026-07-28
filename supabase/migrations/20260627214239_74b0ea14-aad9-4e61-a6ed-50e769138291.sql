CREATE TABLE IF NOT EXISTS public.planipret_integration_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text UNIQUE NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  is_configured boolean NOT NULL DEFAULT false,
  config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_result text,
  last_test_success boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_integration_config TO authenticated;
GRANT ALL ON public.planipret_integration_config TO service_role;

ALTER TABLE public.planipret_integration_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_integration_config_admin_read" ON public.planipret_integration_config;
CREATE POLICY "pp_integration_config_admin_read"
  ON public.planipret_integration_config
  FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "pp_integration_config_admin_write" ON public.planipret_integration_config;
CREATE POLICY "pp_integration_config_admin_write"
  ON public.planipret_integration_config
  FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.pp_integration_config_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pp_integration_config_touch ON public.planipret_integration_config;
CREATE TRIGGER trg_pp_integration_config_touch
  BEFORE UPDATE ON public.planipret_integration_config
  FOR EACH ROW EXECUTE FUNCTION public.pp_integration_config_touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='planipret_integration_config'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_integration_config';
  END IF;
END $$;

ALTER TABLE public.planipret_integration_config REPLICA IDENTITY FULL;