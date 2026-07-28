
REVOKE EXECUTE ON FUNCTION public.lemtel_can_grant_app_access(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_app_user_provision() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_app_user_password_sync() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lemtel_can_grant_app_access(uuid) TO authenticated, service_role;
