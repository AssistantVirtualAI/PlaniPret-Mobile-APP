CREATE OR REPLACE FUNCTION public.rollback_admin_action(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target public.pbx_admin_actions%ROWTYPE;
  _rollback_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO _target
  FROM public.pbx_admin_actions
  WHERE id = _action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin action not found';
  END IF;

  IF NOT (
    public.is_super_admin(_uid)
    OR public.is_lemtel_admin(_uid)
    OR public.has_role(_uid, _target.organization_id, 'org_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.pbx_admin_actions (
    organization_id,
    domain_uuid,
    actor_user_id,
    actor_email,
    entity_type,
    entity_id,
    action,
    source,
    before_json,
    after_json,
    diff_json,
    confirmed_at,
    result,
    error,
    rollback_of,
    metadata
  )
  SELECT
    _target.organization_id,
    _target.domain_uuid,
    _uid,
    p.email,
    _target.entity_type,
    _target.entity_id,
    'rollback.' || _target.action,
    'rollback',
    _target.after_json,
    _target.before_json,
    jsonb_build_object('rollback_of', _target.id, 'original_action', _target.action),
    now(),
    'drafted',
    NULL,
    _target.id,
    jsonb_build_object('status', 'review_required', 'original_created_at', _target.created_at)
  FROM public.profiles p
  WHERE p.id = _uid
  RETURNING id INTO _rollback_id;

  IF _rollback_id IS NULL THEN
    INSERT INTO public.pbx_admin_actions (
      organization_id, domain_uuid, actor_user_id, entity_type, entity_id, action, source,
      before_json, after_json, diff_json, confirmed_at, result, rollback_of, metadata
    ) VALUES (
      _target.organization_id, _target.domain_uuid, _uid, _target.entity_type, _target.entity_id,
      'rollback.' || _target.action, 'rollback', _target.after_json, _target.before_json,
      jsonb_build_object('rollback_of', _target.id, 'original_action', _target.action),
      now(), 'drafted', _target.id,
      jsonb_build_object('status', 'review_required', 'original_created_at', _target.created_at)
    )
    RETURNING id INTO _rollback_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rollback_action_id', _rollback_id, 'rollback_of', _target.id);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_admin_action(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_admin_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_admin_action(uuid) TO service_role;