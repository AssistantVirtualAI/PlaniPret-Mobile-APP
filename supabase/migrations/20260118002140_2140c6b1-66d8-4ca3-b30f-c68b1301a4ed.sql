-- Table to store MCP server configurations for agents
CREATE TABLE public.agent_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  server_url text NOT NULL,
  server_type text NOT NULL DEFAULT 'http',
  auth_type text DEFAULT 'none',
  auth_config jsonb DEFAULT '{}',
  tools_enabled text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table to store platform webhook configurations per agent
CREATE TABLE public.agent_platform_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  webhook_url text NOT NULL,
  webhook_secret text,
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  error_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, platform)
);

-- Enable RLS
ALTER TABLE public.agent_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_platform_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_mcp_servers
CREATE POLICY "Users can view MCP servers for their org agents"
  ON public.agent_mcp_servers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_mcp_servers.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert MCP servers for their org agents"
  ON public.agent_mcp_servers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_mcp_servers.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update MCP servers for their org agents"
  ON public.agent_mcp_servers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_mcp_servers.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete MCP servers for their org agents"
  ON public.agent_mcp_servers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_mcp_servers.organization_id
      AND om.user_id = auth.uid()
    )
  );

-- RLS policies for agent_platform_webhooks
CREATE POLICY "Users can view webhooks for their org agents"
  ON public.agent_platform_webhooks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_platform_webhooks.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert webhooks for their org agents"
  ON public.agent_platform_webhooks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_platform_webhooks.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update webhooks for their org agents"
  ON public.agent_platform_webhooks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_platform_webhooks.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete webhooks for their org agents"
  ON public.agent_platform_webhooks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = agent_platform_webhooks.organization_id
      AND om.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_agent_mcp_servers_agent_id ON public.agent_mcp_servers(agent_id);
CREATE INDEX idx_agent_mcp_servers_org_id ON public.agent_mcp_servers(organization_id);
CREATE INDEX idx_agent_platform_webhooks_agent_id ON public.agent_platform_webhooks(agent_id);
CREATE INDEX idx_agent_platform_webhooks_org_id ON public.agent_platform_webhooks(organization_id);

-- Triggers for updated_at
CREATE TRIGGER update_agent_mcp_servers_updated_at
  BEFORE UPDATE ON public.agent_mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_platform_webhooks_updated_at
  BEFORE UPDATE ON public.agent_platform_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();