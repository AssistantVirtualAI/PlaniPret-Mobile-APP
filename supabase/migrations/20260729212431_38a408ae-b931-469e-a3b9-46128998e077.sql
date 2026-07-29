CREATE OR REPLACE FUNCTION public.get_accessible_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_master_admin(_user_id) THEN
    RETURN QUERY SELECT id FROM public.organizations;
    RETURN;
  END IF;

  RETURN QUERY
  WITH direct AS (
    SELECT org_id, access_all_children FROM public.org_members WHERE user_id = _user_id
    UNION
    SELECT organization_id AS org_id, false FROM public.organization_members WHERE user_id = _user_id
    UNION
    SELECT organization_id AS org_id, false FROM public.user_roles WHERE user_id = _user_id AND organization_id IS NOT NULL
  ),
  expanded AS (
    SELECT org_id FROM direct
    UNION
    SELECT o.id
      FROM public.organizations o
      JOIN direct d ON d.access_all_children = true
     WHERE o.parent_org_id = d.org_id OR o.root_org_id = d.org_id
  )
  SELECT DISTINCT org_id FROM expanded WHERE org_id IS NOT NULL;
END $$;