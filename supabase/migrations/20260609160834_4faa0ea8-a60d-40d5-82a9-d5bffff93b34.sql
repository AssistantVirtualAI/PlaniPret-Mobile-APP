
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS allow_user_self_forwarding boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_my_extension_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _spu record;
  _today_calls int := 0;
  _unread_vm int := 0;
  _presence record;
BEGIN
  IF _uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT organization_id, extension, display_name, status, last_seen_at, sip_domain
    INTO _spu FROM public.pbx_softphone_users WHERE portal_user_id = _uid LIMIT 1;
  IF _spu.organization_id IS NULL THEN RETURN jsonb_build_object('has_extension', false); END IF;

  SELECT count(*) INTO _today_calls FROM public.pbx_call_records
    WHERE organization_id = _spu.organization_id
      AND extension = _spu.extension
      AND start_at >= date_trunc('day', now());

  SELECT count(*) INTO _unread_vm FROM public.pbx_voicemails
    WHERE organization_id = _spu.organization_id
      AND extension = _spu.extension
      AND read_at IS NULL;

  SELECT status, status_message, status_emoji, call_state INTO _presence
    FROM public.user_presence WHERE user_id = _uid LIMIT 1;

  RETURN jsonb_build_object(
    'has_extension', true,
    'extension', _spu.extension,
    'display_name', _spu.display_name,
    'sip_domain', _spu.sip_domain,
    'registration_status', _spu.status,
    'last_seen_at', _spu.last_seen_at,
    'today_calls', _today_calls,
    'unread_voicemail', _unread_vm,
    'presence', COALESCE(to_jsonb(_presence), '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_tenant_isolation(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _result jsonb := '[]'::jsonb;
  _rec record;
  _cnt bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _is_admin := public.is_super_admin(auth.uid()) OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), _org_id, 'org_admin'::app_role);
  IF NOT _is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR _rec IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname AND col.table_name = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND col.column_name = 'organization_id'
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = $1', _rec.table_name)
      INTO _cnt USING _org_id;
    _result := _result || jsonb_build_object(
      'table', _rec.table_name,
      'rows', _cnt,
      'status', 'ok'
    );
  END LOOP;

  RETURN jsonb_build_object('organization_id', _org_id, 'tables', _result, 'checked_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_extension_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_tenant_isolation(uuid) TO authenticated;
