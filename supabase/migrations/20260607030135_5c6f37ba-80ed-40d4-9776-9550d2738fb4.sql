
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS sip_password text,
  ADD COLUMN IF NOT EXISTS wss_url text,
  ADD COLUMN IF NOT EXISTS device_type text DEFAULT 'multi',
  ADD COLUMN IF NOT EXISTS last_seen_ios timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_android timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_mac timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_windows timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_linux timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_web timestamptz,
  ADD COLUMN IF NOT EXISTS active_platforms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS total_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pbx_softphone_users_org_ext_unique'
  ) THEN
    ALTER TABLE public.pbx_softphone_users
      ADD CONSTRAINT pbx_softphone_users_org_ext_unique
      UNIQUE (organization_id, extension);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_platform_seen(p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  col := CASE lower(p_platform)
    WHEN 'ios' THEN 'last_seen_ios'
    WHEN 'android' THEN 'last_seen_android'
    WHEN 'mac' THEN 'last_seen_mac'
    WHEN 'windows' THEN 'last_seen_windows'
    WHEN 'linux' THEN 'last_seen_linux'
    WHEN 'web' THEN 'last_seen_web'
    ELSE NULL
  END;
  IF col IS NULL THEN RETURN; END IF;

  EXECUTE format(
    'UPDATE public.pbx_softphone_users
       SET %I = now(),
           last_seen_at = now(),
           status = ''online'',
           active_platforms = array_append(array_remove(active_platforms, $1), $1)
     WHERE portal_user_id = $2', col)
  USING lower(p_platform), auth.uid();
END $$;

GRANT EXECUTE ON FUNCTION public.update_platform_seen(text) TO authenticated;
