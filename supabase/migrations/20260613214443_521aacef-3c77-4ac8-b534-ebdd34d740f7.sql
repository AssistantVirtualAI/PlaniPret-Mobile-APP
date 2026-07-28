
-- Allow linking softphone by extension+email (the Extension dialog passes extension row id, not softphone id)
CREATE OR REPLACE FUNCTION public.admin_link_softphone_by_extension_email(
  _org_id uuid, _extension text, _email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _spu_id uuid;
  _uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(auth.uid(), _org_id, 'org_admin'::app_role)
       OR public.is_super_admin(auth.uid())
       OR public.is_lemtel_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO _spu_id FROM public.pbx_softphone_users
   WHERE organization_id = _org_id AND extension = _extension LIMIT 1;
  IF _spu_id IS NULL THEN RAISE EXCEPTION 'no softphone user for extension %', _extension; END IF;

  IF _email IS NULL OR _email = '' THEN
    UPDATE public.pbx_softphone_users SET portal_user_id = NULL, updated_at = now() WHERE id = _spu_id;
    RETURN jsonb_build_object('ok', true, 'portal_user_id', NULL);
  END IF;

  SELECT id INTO _uid FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;
  IF _uid IS NULL THEN RAISE EXCEPTION 'no portal user with email %', _email; END IF;

  UPDATE public.pbx_softphone_users
     SET portal_user_id = _uid, updated_at = now()
   WHERE id = _spu_id;

  RETURN jsonb_build_object('ok', true, 'portal_user_id', _uid, 'softphone_id', _spu_id);
END $$;
