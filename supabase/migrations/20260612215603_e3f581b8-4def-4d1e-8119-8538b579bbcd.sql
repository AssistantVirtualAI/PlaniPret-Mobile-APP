
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS app_access_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_softphone_app_access(_softphone_id uuid, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _row public.pbx_softphone_users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id=_softphone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'softphone user not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
       OR public.is_lemtel_admin(auth.uid())
       OR public.has_role(auth.uid(), _row.organization_id, 'org_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.pbx_softphone_users
     SET app_access_enabled=_enabled, updated_at=now()
   WHERE id=_softphone_id;
  RETURN jsonb_build_object('ok', true, 'app_access_enabled', _enabled);
END $$;

CREATE OR REPLACE FUNCTION public.my_app_access_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(bool_or(app_access_enabled), true)
  FROM public.pbx_softphone_users
  WHERE portal_user_id = auth.uid();
$$;
