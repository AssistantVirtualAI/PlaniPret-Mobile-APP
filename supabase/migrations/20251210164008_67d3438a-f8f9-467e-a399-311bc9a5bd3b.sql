-- Drop existing SELECT policy on leads
DROP POLICY IF EXISTS "Role-based lead access" ON public.leads;

-- Create new restrictive SELECT policy:
-- org_admin, manager, super_admin can see all leads in their org
-- agent role can only see leads assigned to them (agent_id matches an agent in their org where they have a role)
-- Since there's no direct user-to-agent mapping, agents can only see leads where agent_id IS NULL (unassigned/available)
CREATE POLICY "Role-based lead access"
ON public.leads
FOR SELECT
USING (
  -- Managers, org_admins, and super_admins can see all leads in their organization
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR 
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
  is_super_admin(auth.uid()) OR
  -- Agent role can only see unassigned leads (available for pickup) in their organization
  (
    has_role(auth.uid(), organization_id, 'agent'::app_role) AND 
    agent_id IS NULL AND
    EXISTS (
      SELECT 1 FROM organization_members om 
      WHERE om.organization_id = leads.organization_id 
      AND om.user_id = auth.uid()
    )
  )
);