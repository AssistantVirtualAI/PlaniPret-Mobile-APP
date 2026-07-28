-- Allow authenticated users to insert sync health rows for orgs they belong to
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='telecom_sync_health'
      AND policyname='members can record sync health'
  ) THEN
    CREATE POLICY "members can record sync health"
      ON public.telecom_sync_health
      FOR INSERT
      TO authenticated
      WITH CHECK (
        organization_id IN (SELECT public.current_user_org_ids())
      );
  END IF;
END $$;

-- Verification helper: confirms the calling extension user only sees rows tied to their extension.
CREATE OR REPLACE FUNCTION public.audit_my_extension_isolation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _spu record;
  _cdrs bigint := 0;
  _vms bigint := 0;
  _recs bigint := 0;
  _other_cdrs bigint := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT organization_id, extension INTO _spu
    FROM public.pbx_softphone_users WHERE portal_user_id = _uid LIMIT 1;
  IF _spu.organization_id IS NULL THEN
    RETURN jsonb_build_object('has_extension', false);
  END IF;

  SELECT count(*) INTO _cdrs FROM public.pbx_call_records
    WHERE organization_id = _spu.organization_id AND extension = _spu.extension;
  SELECT count(*) INTO _vms FROM public.pbx_voicemails
    WHERE organization_id = _spu.organization_id AND extension = _spu.extension;
  SELECT count(*) INTO _recs FROM public.pbx_call_recordings r
    WHERE r.organization_id = _spu.organization_id
      AND EXISTS (
        SELECT 1 FROM public.pbx_call_records cr
        WHERE cr.id = r.call_record_id AND cr.extension = _spu.extension
      );
  SELECT count(*) INTO _other_cdrs FROM public.pbx_call_records
    WHERE organization_id = _spu.organization_id AND extension <> _spu.extension;

  RETURN jsonb_build_object(
    'has_extension', true,
    'extension', _spu.extension,
    'organization_id', _spu.organization_id,
    'visible_cdrs', _cdrs,
    'visible_voicemails', _vms,
    'visible_recordings', _recs,
    'other_extension_cdrs_visible', _other_cdrs,
    'strict_isolation_ok', _other_cdrs = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_my_extension_isolation() TO authenticated;