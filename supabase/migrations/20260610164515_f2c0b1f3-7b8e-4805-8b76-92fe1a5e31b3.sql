REVOKE EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_lemtel_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_lemtel_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_lemtel_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_lemtel_admin(uuid) TO authenticated, service_role;