CREATE TABLE public.mobile_app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL,
  channel text NOT NULL DEFAULT 'prod',
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  messages jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_version text,
  recommended_version text,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_key, channel)
);

GRANT SELECT ON public.mobile_app_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mobile_app_config TO authenticated;
GRANT ALL ON public.mobile_app_config TO service_role;
ALTER TABLE public.mobile_app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobile_config_read" ON public.mobile_app_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mobile_config_write" ON public.mobile_app_config
  FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.mobile_app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL,
  channel text NOT NULL DEFAULT 'prod',
  version text NOT NULL,
  native_version_min text,
  bundle_path text NOT NULL,
  bundle_sha256 text,
  bundle_size bigint,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  rolled_back_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_key, channel, version)
);

GRANT SELECT ON public.mobile_app_releases TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mobile_app_releases TO authenticated;
GRANT ALL ON public.mobile_app_releases TO service_role;
ALTER TABLE public.mobile_app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobile_releases_read" ON public.mobile_app_releases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mobile_releases_write" ON public.mobile_app_releases
  FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.mobile_app_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL,
  channel text NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mobile_app_config_audit TO authenticated;
GRANT ALL ON public.mobile_app_config_audit TO service_role;
ALTER TABLE public.mobile_app_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobile_audit_read_admin" ON public.mobile_app_config_audit
  FOR SELECT TO authenticated
  USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER mobile_app_config_touch BEFORE UPDATE ON public.mobile_app_config
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();
CREATE TRIGGER mobile_app_releases_touch BEFORE UPDATE ON public.mobile_app_releases
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

INSERT INTO public.mobile_app_config (app_key, channel, flags, messages, settings)
VALUES
  ('planipret', 'prod', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('planipret', 'beta', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('lemtel', 'prod', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('lemtel', 'beta', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);