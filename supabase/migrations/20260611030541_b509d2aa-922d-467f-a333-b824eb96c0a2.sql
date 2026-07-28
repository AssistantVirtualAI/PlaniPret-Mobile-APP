
CREATE TABLE IF NOT EXISTS public.pbx_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_domains TO authenticated;
GRANT ALL ON public.pbx_domains TO service_role;
ALTER TABLE public.pbx_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view domains" ON public.pbx_domains FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_time_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_destination text,
  nomatch_destination text,
  enabled boolean NOT NULL DEFAULT true,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_time_conditions TO authenticated;
GRANT ALL ON public.pbx_time_conditions TO service_role;
ALTER TABLE public.pbx_time_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view time_conditions" ON public.pbx_time_conditions FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_dialplans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  context text NOT NULL DEFAULT 'public',
  category text,
  number text,
  continue_flag boolean NOT NULL DEFAULT false,
  sequence int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  xml_definition text,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_dialplans TO authenticated;
GRANT ALL ON public.pbx_dialplans TO service_role;
ALTER TABLE public.pbx_dialplans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view dialplans" ON public.pbx_dialplans FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  destination_type text NOT NULL DEFAULT 'inbound',
  destination_number text NOT NULL,
  destination_prefix text,
  caller_id_name text,
  caller_id_number text,
  destination_app text,
  destination_action text,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_destinations TO authenticated;
GRANT ALL ON public.pbx_destinations TO service_role;
ALTER TABLE public.pbx_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view destinations" ON public.pbx_destinations FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  proxy text,
  realm text,
  username text,
  from_user text,
  from_domain text,
  expire_seconds int DEFAULT 800,
  register boolean DEFAULT true,
  context text DEFAULT 'public',
  profile text DEFAULT 'external',
  status text,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_gateways TO authenticated;
GRANT ALL ON public.pbx_gateways TO service_role;
ALTER TABLE public.pbx_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins view gateways" ON public.pbx_gateways FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.pbx_sip_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  status text,
  bindings jsonb DEFAULT '{}'::jsonb,
  codecs text,
  nat_settings jsonb DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_sip_profiles TO authenticated;
GRANT ALL ON public.pbx_sip_profiles TO service_role;
ALTER TABLE public.pbx_sip_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins view sip profiles" ON public.pbx_sip_profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_lemtel_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.pbx_conferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  extension text,
  pin text,
  moderator_pin text,
  max_members int DEFAULT 50,
  record boolean DEFAULT false,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_conferences TO authenticated;
GRANT ALL ON public.pbx_conferences TO service_role;
ALTER TABLE public.pbx_conferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view conferences" ON public.pbx_conferences FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_hold_music (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text UNIQUE,
  name text NOT NULL,
  path text,
  rate int DEFAULT 8000,
  shuffle boolean DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  storage_path text,
  pbx_etag text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pbx_hold_music TO authenticated;
GRANT ALL ON public.pbx_hold_music TO service_role;
ALTER TABLE public.pbx_hold_music ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view hold music" ON public.pbx_hold_music FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.pbx_object_owner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid,
  object_type text NOT NULL,
  object_pbx_uuid text NOT NULL,
  object_local_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_type, object_pbx_uuid)
);
GRANT SELECT ON public.pbx_object_owner TO authenticated;
GRANT ALL ON public.pbx_object_owner TO service_role;
ALTER TABLE public.pbx_object_owner ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view ownership" ON public.pbx_object_owner FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));
CREATE INDEX IF NOT EXISTS idx_pbx_object_owner_client ON public.pbx_object_owner (client_id);
CREATE INDEX IF NOT EXISTS idx_pbx_object_owner_type ON public.pbx_object_owner (organization_id, object_type);

DO $$ BEGIN
  CREATE TYPE public.voice_agent_binding_type AS ENUM ('did','extension','ivr_option','queue_overflow');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.voice_agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid,
  voice_agent_id uuid NOT NULL,
  binding_type public.voice_agent_binding_type NOT NULL,
  target_ref text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  after_hours_only boolean NOT NULL DEFAULT false,
  business_hours_id uuid,
  pbx_dialplan_uuid text,
  config jsonb DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_agent_bindings TO authenticated;
GRANT ALL ON public.voice_agent_bindings TO service_role;
ALTER TABLE public.voice_agent_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view voice bindings" ON public.voice_agent_bindings FOR SELECT TO authenticated
  USING (public.can_view_org(auth.uid(), organization_id));
CREATE POLICY "org admins manage voice bindings" ON public.voice_agent_bindings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_vab_client ON public.voice_agent_bindings (client_id);
CREATE INDEX IF NOT EXISTS idx_vab_agent ON public.voice_agent_bindings (voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_vab_type_target ON public.voice_agent_bindings (binding_type, target_ref);

CREATE OR REPLACE FUNCTION public.pbx_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pbx_domains','pbx_time_conditions','pbx_dialplans','pbx_destinations','pbx_gateways','pbx_sip_profiles','pbx_conferences','pbx_hold_music','pbx_object_owner','voice_agent_bindings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pbx_set_updated_at()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_pbx_for_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = _client_id
        AND (
          public.has_role(_user_id, c.organization_id, 'org_admin'::app_role)
          OR public.has_role(_user_id, c.organization_id, 'manager'::app_role)
        )
    )
$$;

CREATE OR REPLACE VIEW public.pbx_gateways_safe AS
SELECT id, organization_id, pbx_uuid, name, proxy, realm, from_user, from_domain,
       expire_seconds, register, context, profile, status, enabled,
       last_synced_at, created_at, updated_at
FROM public.pbx_gateways;
GRANT SELECT ON public.pbx_gateways_safe TO authenticated;

CREATE OR REPLACE VIEW public.voice_agent_bindings_safe AS
SELECT id, organization_id, client_id, voice_agent_id, binding_type, target_ref,
       priority, active, after_hours_only, business_hours_id, last_synced_at,
       created_at, updated_at
FROM public.voice_agent_bindings;
GRANT SELECT ON public.voice_agent_bindings_safe TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pbx_domains','pbx_time_conditions','pbx_dialplans','pbx_destinations',
    'pbx_gateways','pbx_sip_profiles','pbx_conferences','pbx_hold_music',
    'pbx_object_owner','voice_agent_bindings'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN others THEN NULL;
    END;
  END LOOP;
END $$;
