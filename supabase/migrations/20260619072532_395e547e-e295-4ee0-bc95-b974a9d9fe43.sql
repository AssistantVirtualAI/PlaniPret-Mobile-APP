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
  UNION
  SELECT organization_id
  FROM public.pbx_softphone_users
  WHERE portal_user_id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  UNION
  SELECT org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
  UNION
  SELECT organization_id
  FROM public.pbx_softphone_users
  WHERE portal_user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_chat_channel(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_chat_channels c
    WHERE c.id = _channel_id
      AND c.organization_id IN (SELECT public.get_user_organization_ids(_user_id))
      AND (
        c.channel_type = 'public'
        OR c.created_by = _user_id
        OR _user_id = ANY(c.members)
        OR public.is_super_admin(_user_id)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_chat_channel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_chat_channel(uuid, uuid) TO authenticated, service_role;