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
  UNION
  SELECT org_id
  FROM public.org_members
  WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_lemtel_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id
      AND org_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
  ) OR public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_lemtel_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid, 'org_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = _user_id
        AND org_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
        AND (role IN ('owner', 'admin', 'org_admin') OR can_manage_extensions = true OR can_listen_calls = true)
    )
    OR public.is_super_admin(_user_id)
$$;