-- Enable RLS on agent_insights if not already enabled
ALTER TABLE public.agent_insights ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies that might allow public access
DROP POLICY IF EXISTS "System can manage agent insights" ON public.agent_insights;

-- Create policy for organization members to view insights
CREATE POLICY "Users can view organization agent insights" 
ON public.agent_insights 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = agent_insights.organization_id
    AND organization_members.user_id = auth.uid()
  )
);

-- Create policy for system/service role to insert insights (from edge functions)
CREATE POLICY "System can insert agent insights" 
ON public.agent_insights 
FOR INSERT 
WITH CHECK (true);

-- Create policy for system/service role to update insights
CREATE POLICY "System can update agent insights" 
ON public.agent_insights 
FOR UPDATE 
USING (true);

-- Create policy for admins to delete insights
CREATE POLICY "Org admins can delete agent insights" 
ON public.agent_insights 
FOR DELETE 
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) 
  OR is_super_admin(auth.uid())
);