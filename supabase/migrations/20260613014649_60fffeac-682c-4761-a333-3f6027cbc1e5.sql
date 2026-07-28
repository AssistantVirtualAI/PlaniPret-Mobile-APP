
CREATE TABLE IF NOT EXISTS public.voice_agent_gateway_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  elevenlabs_phone_id text,
  pbx_gateway_uuid uuid,
  did_e164 text NOT NULL,
  direction text NOT NULL DEFAULT 'both' CHECK (direction IN ('inbound','outbound','both')),
  auto_bound boolean NOT NULL DEFAULT true,
  manual_override boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, did_e164)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_agent_gateway_routes TO authenticated;
GRANT ALL ON public.voice_agent_gateway_routes TO service_role;

ALTER TABLE public.voice_agent_gateway_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view routes"
  ON public.voice_agent_gateway_routes FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can insert routes"
  ON public.voice_agent_gateway_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can update routes"
  ON public.voice_agent_gateway_routes FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can delete routes"
  ON public.voice_agent_gateway_routes FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS voice_agent_gateway_routes_org_idx
  ON public.voice_agent_gateway_routes(organization_id);
CREATE INDEX IF NOT EXISTS voice_agent_gateway_routes_agent_idx
  ON public.voice_agent_gateway_routes(agent_id);
CREATE INDEX IF NOT EXISTS voice_agent_gateway_routes_gateway_idx
  ON public.voice_agent_gateway_routes(pbx_gateway_uuid);

CREATE TRIGGER trg_voice_agent_gateway_routes_updated
  BEFORE UPDATE ON public.voice_agent_gateway_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
