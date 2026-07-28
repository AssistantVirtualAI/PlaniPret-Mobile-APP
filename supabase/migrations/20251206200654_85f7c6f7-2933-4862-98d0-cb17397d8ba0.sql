-- Create security definer function to get user organization IDs without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE user_id = _user_id
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;

-- Create new non-recursive policy using the function
CREATE POLICY "Users can view org members via function"
ON public.organization_members
FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
);