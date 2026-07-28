-- Drop existing problematic policies on organization_members
DROP POLICY IF EXISTS "Users can view org members via membership" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.organization_members;

-- Create non-recursive policies for organization_members
-- Policy 1: Users can always view their own membership records
CREATE POLICY "Users can view own memberships"
ON public.organization_members
FOR SELECT
USING (user_id = auth.uid());

-- Policy 2: Users can view other members of organizations they belong to
-- Using a direct check without recursive subquery
CREATE POLICY "Users can view org members"
ON public.organization_members
FOR SELECT
USING (
  organization_id IN (
    SELECT om.organization_id 
    FROM public.organization_members om 
    WHERE om.user_id = auth.uid()
  )
);