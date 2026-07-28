-- Create agents table for managing AI agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('elevenlabs', 'vapi', 'retell', 'openai')),
  is_external BOOLEAN DEFAULT FALSE,
  assigned_to UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view agents from their organizations
CREATE POLICY "Users can view organization agents"
  ON public.agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = agents.organization_id
        AND user_id = auth.uid()
    )
  );

-- RLS: Agents and managers can create agents
CREATE POLICY "Agents can create organization agents"
  ON public.agents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = agents.organization_id
        AND user_id = auth.uid()
        AND role IN ('agent', 'manager', 'org_admin', 'super_admin')
    )
  );

-- RLS: Agents and managers can update agents
CREATE POLICY "Agents can update organization agents"
  ON public.agents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = agents.organization_id
        AND user_id = auth.uid()
        AND role IN ('agent', 'manager', 'org_admin', 'super_admin')
    )
  );

-- RLS: Managers can delete agents
CREATE POLICY "Managers can delete organization agents"
  ON public.agents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = agents.organization_id
        AND user_id = auth.uid()
        AND role IN ('manager', 'org_admin', 'super_admin')
    )
  );

-- Create indexes for performance
CREATE INDEX idx_agents_org_id ON public.agents(organization_id);
CREATE INDEX idx_agents_platform ON public.agents(platform);
CREATE INDEX idx_agents_assigned_to ON public.agents(assigned_to);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();