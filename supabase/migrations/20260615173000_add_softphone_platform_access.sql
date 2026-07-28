-- Additive release: per-platform access controls for AVA desktop/mobile without breaking existing app_access_enabled.

ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS desktop_access_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_access_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pbx_softphone_users.app_access_enabled IS
  'Global application access. When false, web, desktop and mobile softphone access must be denied.';
COMMENT ON COLUMN public.pbx_softphone_users.desktop_access_enabled IS
  'Allows this softphone user to sign in from AVA desktop apps when global app access is enabled.';
COMMENT ON COLUMN public.pbx_softphone_users.mobile_access_enabled IS
  'Allows this softphone user to sign in from AVA mobile apps when global app access is enabled.';

CREATE OR REPLACE FUNCTION public.set_softphone_platform_access(
  _softphone_id uuid,
  _platform text,
  _enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.pbx_softphone_users%ROWTYPE;
  _normalized_platform text := lower(coalesce(_platform, 'app'));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id = _softphone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'softphone user not found';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), _row.organization_id, 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _normalized_platform IN ('app', 'global', 'all') THEN
    UPDATE public.pbx_softphone_users
       SET app_access_enabled = _enabled,
           updated_at = now()
     WHERE id = _softphone_id;
  ELSIF _normalized_platform IN ('desktop', 'mac', 'windows', 'linux') THEN
    UPDATE public.pbx_softphone_users
       SET desktop_access_enabled = _enabled,
           updated_at = now()
     WHERE id = _softphone_id;
  ELSIF _normalized_platform IN ('mobile', 'ios', 'android') THEN
    UPDATE public.pbx_softphone_users
       SET mobile_access_enabled = _enabled,
           updated_at = now()
     WHERE id = _softphone_id;
  ELSE
    RAISE EXCEPTION 'unsupported platform: %', _platform;
  END IF;

  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id = _softphone_id;
  RETURN jsonb_build_object(
    'ok', true,
    'platform', _normalized_platform,
    'enabled', _enabled,
    'app_access_enabled', _row.app_access_enabled,
    'desktop_access_enabled', _row.desktop_access_enabled,
    'mobile_access_enabled', _row.mobile_access_enabled
  );
END;
$$;

-- Keep the legacy RPC name used by existing Lovable work, but route it through the platform-aware implementation.
CREATE OR REPLACE FUNCTION public.set_softphone_app_access(_softphone_id uuid, _enabled boolean)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.set_softphone_platform_access(_softphone_id, 'app', _enabled);
$$;

CREATE OR REPLACE FUNCTION public.my_platform_access_allowed(_platform text DEFAULT 'app')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    bool_or(
      app_access_enabled
      AND CASE
        WHEN lower(coalesce(_platform, 'app')) IN ('desktop', 'mac', 'windows', 'linux') THEN desktop_access_enabled
        WHEN lower(coalesce(_platform, 'app')) IN ('mobile', 'ios', 'android') THEN mobile_access_enabled
        ELSE true
      END
    ),
    true
  )
  FROM public.pbx_softphone_users
  WHERE portal_user_id = auth.uid();
$$;

-- Preserve existing callers that check only global app access.
CREATE OR REPLACE FUNCTION public.my_app_access_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.my_platform_access_allowed('app');
$$;
