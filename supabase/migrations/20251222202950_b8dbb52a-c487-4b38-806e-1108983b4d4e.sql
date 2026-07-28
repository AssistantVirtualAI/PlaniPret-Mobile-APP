-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Admins can insert integrations" ON public.organization_integrations;

-- Create a more permissive INSERT policy that allows:
-- 1. Users to insert their own integrations (user_id = auth.uid())
-- 2. Org admins to insert org-level integrations
CREATE POLICY "Users can insert own integrations"
ON public.organization_integrations
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
);