CREATE TABLE IF NOT EXISTS public.planipret_outbound_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  extension text,
  caller_id_number text,
  caller_id_name text,
  client_type text NOT NULL DEFAULT 'mobile' CHECK (client_type IN ('mobile','web')),
  outbound_enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_outbound_settings TO authenticated;
GRANT ALL ON public.planipret_outbound_settings TO service_role;

ALTER TABLE public.planipret_outbound_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage outbound settings"
ON public.planipret_outbound_settings FOR ALL TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Brokers read own outbound settings"
ON public.planipret_outbound_settings FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER planipret_outbound_settings_touch
BEFORE UPDATE ON public.planipret_outbound_settings
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();