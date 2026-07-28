-- Create client_agent_assignments table for assigning agents to clients with roles
CREATE TABLE public.client_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, agent_id)
);

-- Enable RLS
ALTER TABLE public.client_agent_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_agent_assignments

-- Org admins can manage all assignments in their organization
CREATE POLICY "Org admins can manage client agent assignments"
ON public.client_agent_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_agent_assignments.client_id
    AND (
      has_role(auth.uid(), c.organization_id, 'org_admin') OR
      has_role(auth.uid(), c.organization_id, 'manager') OR
      is_super_admin(auth.uid())
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_agent_assignments.client_id
    AND (
      has_role(auth.uid(), c.organization_id, 'org_admin') OR
      has_role(auth.uid(), c.organization_id, 'manager') OR
      is_super_admin(auth.uid())
    )
  )
);

-- Users can view assignments in their organization
CREATE POLICY "Users can view client agent assignments"
ON public.client_agent_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = client_agent_assignments.client_id
    AND om.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_client_agent_assignments_updated_at
BEFORE UPDATE ON public.client_agent_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_client_agent_assignments_client_id ON public.client_agent_assignments(client_id);
CREATE INDEX idx_client_agent_assignments_agent_id ON public.client_agent_assignments(agent_id);