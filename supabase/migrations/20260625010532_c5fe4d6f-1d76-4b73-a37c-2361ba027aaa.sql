
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS elevenlabs_session_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elevenlabs_last_session timestamptz,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_status text DEFAULT 'not_configured';

CREATE TABLE IF NOT EXISTS public.planipret_elevenlabs_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_elevenlabs_config TO authenticated;
GRANT ALL ON public.planipret_elevenlabs_config TO service_role;

ALTER TABLE public.planipret_elevenlabs_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_planipret_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'planipret_admin'::app_role
  );
$$;

DROP POLICY IF EXISTS "Admin manage elevenlabs config" ON public.planipret_elevenlabs_config;
CREATE POLICY "Admin manage elevenlabs config" ON public.planipret_elevenlabs_config
  FOR ALL TO authenticated
  USING (public.is_planipret_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()));
