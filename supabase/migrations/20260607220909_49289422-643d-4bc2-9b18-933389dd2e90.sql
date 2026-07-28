
CREATE OR REPLACE FUNCTION public.log_softphone_call(
  _direction text,
  _remote_number text,
  _started_at timestamptz,
  _ended_at timestamptz,
  _duration_seconds integer,
  _hangup_cause text DEFAULT NULL,
  _sip_call_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _spu record;
  _record_id uuid;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT organization_id, extension
    INTO _spu
    FROM public.pbx_softphone_users
   WHERE portal_user_id = _uid
   LIMIT 1;
  IF _spu.organization_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.pbx_call_records (
    organization_id, direction, extension,
    caller_number, destination_number, source_number,
    start_at, answer_at, end_at,
    duration_seconds, billsec,
    call_status, hangup_cause, sip_call_id,
    missed_call
  ) VALUES (
    _spu.organization_id,
    _direction,
    _spu.extension,
    CASE WHEN _direction = 'inbound' THEN _remote_number ELSE _spu.extension END,
    CASE WHEN _direction = 'outbound' THEN _remote_number ELSE _spu.extension END,
    CASE WHEN _direction = 'inbound' THEN _remote_number ELSE _spu.extension END,
    _started_at, _started_at, _ended_at,
    COALESCE(_duration_seconds, 0), COALESCE(_duration_seconds, 0),
    CASE WHEN COALESCE(_duration_seconds,0) > 0 THEN 'answered' ELSE 'missed' END,
    _hangup_cause, _sip_call_id,
    COALESCE(_duration_seconds,0) = 0
  )
  RETURNING id INTO _record_id;
  RETURN _record_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_softphone_call(text, text, timestamptz, timestamptz, integer, text, text) TO authenticated;
