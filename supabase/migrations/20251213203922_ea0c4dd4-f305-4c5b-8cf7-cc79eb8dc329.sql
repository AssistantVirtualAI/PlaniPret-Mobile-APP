-- Drop existing SELECT policy that allows agents to see unassigned leads
DROP POLICY IF EXISTS "Role-based lead access" ON public.leads;

-- Create new restrictive policy: Only managers and admins can view leads
-- Agents no longer have access to leads (prevents data exposure if agent accounts compromised)
CREATE POLICY "Role-based lead access"
ON public.leads
FOR SELECT
USING (
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR 
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR 
  is_super_admin(auth.uid())
);