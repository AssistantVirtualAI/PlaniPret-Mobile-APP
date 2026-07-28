
-- Self-access policy joining by pbx_uuid when call_record_id is null
CREATE POLICY "Softphone users view recordings by pbx_uuid match"
  ON public.pbx_call_recordings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pbx_call_records r
      JOIN public.pbx_softphone_users s
        ON s.organization_id = r.organization_id
       AND s.portal_user_id = auth.uid()
       AND (s.extension = r.extension
            OR s.extension = r.caller_number
            OR s.extension = r.destination_number
            OR s.extension = r.source_number)
      WHERE r.organization_id = pbx_call_recordings.organization_id
        AND (
          r.id = pbx_call_recordings.call_record_id
          OR (r.pbx_uuid IS NOT NULL AND r.pbx_uuid = pbx_call_recordings.pbx_uuid)
        )
    )
  );

CREATE OR REPLACE FUNCTION public.audit_my_recordings_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _spu_rows jsonb;
  _spu_count int;
  _call_count int;
  _recording_count int;
  _orphan_recording_count int;
  _resolved_org uuid;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;
  SELECT email INTO _email FROM public.profiles WHERE id = _uid;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'extension', extension, 'organization_id', organization_id,
    'sip_domain', sip_domain, 'status', status, 'last_seen_at', last_seen_at,
    'desktop_access_enabled', desktop_access_enabled,
    'mobile_access_enabled', mobile_access_enabled,
    'app_access_enabled', app_access_enabled
  )), '[]'::jsonb), count(*)
  INTO _spu_rows, _spu_count
  FROM public.pbx_softphone_users WHERE portal_user_id = _uid;

  SELECT organization_id INTO _resolved_org
  FROM public.pbx_softphone_users WHERE portal_user_id = _uid LIMIT 1;

  SELECT count(*) INTO _call_count FROM public.pbx_call_records r
   WHERE _resolved_org IS NOT NULL AND r.organization_id = _resolved_org
     AND EXISTS (
       SELECT 1 FROM public.pbx_softphone_users s
       WHERE s.portal_user_id = _uid AND s.organization_id = r.organization_id
         AND (s.extension = r.extension OR s.extension = r.caller_number OR s.extension = r.destination_number OR s.extension = r.source_number)
     );

  SELECT count(*) INTO _recording_count
   FROM public.pbx_call_recordings rec
   JOIN public.pbx_call_records r
     ON r.organization_id = rec.organization_id
    AND (r.id = rec.call_record_id OR (r.pbx_uuid IS NOT NULL AND r.pbx_uuid = rec.pbx_uuid))
   WHERE _resolved_org IS NOT NULL AND rec.organization_id = _resolved_org
     AND EXISTS (
       SELECT 1 FROM public.pbx_softphone_users s
       WHERE s.portal_user_id = _uid AND s.organization_id = r.organization_id
         AND (s.extension = r.extension OR s.extension = r.caller_number OR s.extension = r.destination_number OR s.extension = r.source_number)
     );

  SELECT count(*) INTO _orphan_recording_count FROM public.pbx_call_recordings rec
   WHERE _resolved_org IS NOT NULL AND rec.organization_id = _resolved_org
     AND rec.call_record_id IS NULL;

  RETURN jsonb_build_object(
    'user_id', _uid,
    'email', _email,
    'softphone_users_count', _spu_count,
    'softphone_users', _spu_rows,
    'resolved_organization_id', _resolved_org,
    'matching_call_records', _call_count,
    'matching_recordings', _recording_count,
    'orphan_recordings_in_org', _orphan_recording_count,
    'has_mapping', _spu_count > 0,
    'checked_at', now()
  );
END
$$;
GRANT EXECUTE ON FUNCTION public.audit_my_recordings_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.relink_my_softphone_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _matched int := 0;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('error','not_authenticated'); END IF;
  SELECT email INTO _email FROM public.profiles WHERE id = _uid;
  IF _email IS NULL THEN RETURN jsonb_build_object('error','no_profile_email'); END IF;

  WITH candidates AS (
    SELECT s.id
    FROM public.pbx_softphone_users s
    WHERE s.portal_user_id IS NULL
      AND (
        lower(s.display_name) LIKE '%' || lower(_email) || '%'
        OR lower(split_part(_email,'@',1)) = lower(s.extension)
      )
  )
  UPDATE public.pbx_softphone_users s
     SET portal_user_id = _uid, updated_at = now()
     FROM candidates c
   WHERE s.id = c.id;
  GET DIAGNOSTICS _matched = ROW_COUNT;

  RETURN jsonb_build_object('linked', _matched, 'email', _email);
END
$$;
GRANT EXECUTE ON FUNCTION public.relink_my_softphone_user() TO authenticated;
