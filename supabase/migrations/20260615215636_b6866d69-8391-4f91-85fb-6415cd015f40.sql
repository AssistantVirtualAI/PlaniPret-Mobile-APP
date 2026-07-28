CREATE OR REPLACE FUNCTION public.my_platform_access_allowed(_platform text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(bool_or(
    CASE lower(_platform)
      WHEN 'desktop' THEN COALESCE(desktop_access_enabled, true) AND COALESCE(app_access_enabled, true)
      WHEN 'mobile'  THEN COALESCE(mobile_access_enabled, true)  AND COALESCE(app_access_enabled, true)
      WHEN 'web'     THEN COALESCE(app_access_enabled, true)
      ELSE COALESCE(app_access_enabled, true)
    END
  ), true)
  FROM public.pbx_softphone_users
  WHERE portal_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_platform_access_allowed(text) TO authenticated, anon;