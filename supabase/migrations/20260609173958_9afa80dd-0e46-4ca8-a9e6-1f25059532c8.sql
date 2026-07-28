
CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_records_org_pbx_uuid_uniq
  ON public.pbx_call_records (organization_id, pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_records_org_sip_call_id_uniq
  ON public.pbx_call_records (organization_id, sip_call_id)
  WHERE sip_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pbx_call_records_org_start_idx
  ON public.pbx_call_records (organization_id, start_at DESC);

CREATE INDEX IF NOT EXISTS pbx_call_records_org_ext_start_idx
  ON public.pbx_call_records (organization_id, extension, start_at DESC);

CREATE INDEX IF NOT EXISTS pbx_voicemails_org_received_idx
  ON public.pbx_voicemails (organization_id, received_at DESC);

CREATE INDEX IF NOT EXISTS pbx_sms_messages_org_sent_idx
  ON public.pbx_sms_messages (organization_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.reconcile_pbx_call_records(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _removed int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _is_admin := public.is_super_admin(auth.uid())
            OR public.is_lemtel_admin(auth.uid())
            OR public.has_role(auth.uid(), _org_id, 'org_admin'::app_role);
  IF NOT _is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH dups AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY organization_id, COALESCE(pbx_uuid, sip_call_id)
             ORDER BY created_at ASC
           ) AS rn
    FROM public.pbx_call_records
    WHERE organization_id = _org_id
      AND (pbx_uuid IS NOT NULL OR sip_call_id IS NOT NULL)
  )
  DELETE FROM public.pbx_call_records r
   USING dups
  WHERE r.id = dups.id AND dups.rn > 1;
  GET DIAGNOSTICS _removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', _org_id,
    'duplicates_removed', _removed,
    'reconciled_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_pbx_call_records(uuid) TO authenticated;
