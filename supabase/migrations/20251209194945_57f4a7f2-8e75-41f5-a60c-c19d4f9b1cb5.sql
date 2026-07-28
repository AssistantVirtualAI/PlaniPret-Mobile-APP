-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view organization leads" ON public.leads;

-- Create more restrictive SELECT policy:
-- Managers, org_admins, super_admins can view all leads in their organization
-- Agents can only view leads assigned to them (via agent_id matching their agents)
CREATE POLICY "Role-based lead access" ON public.leads
FOR SELECT USING (
  -- Managers and above can see all org leads
  has_role(auth.uid(), organization_id, 'manager'::app_role) 
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role) 
  OR is_super_admin(auth.uid())
  -- Agents can only see leads linked to agents they manage
  OR (
    has_role(auth.uid(), organization_id, 'agent'::app_role) 
    AND agent_id IN (
      SELECT a.id FROM agents a 
      WHERE a.organization_id = leads.organization_id
      AND EXISTS (
        SELECT 1 FROM organization_members om 
        WHERE om.organization_id = a.organization_id 
        AND om.user_id = auth.uid()
      )
    )
  )
);