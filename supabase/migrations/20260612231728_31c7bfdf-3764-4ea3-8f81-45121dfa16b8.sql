CREATE OR REPLACE FUNCTION public.trigger_pbx_sync(_org_id uuid DEFAULT '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _key text;
  _req_id bigint;
BEGIN
  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  IF _key IS NULL THEN
    RAISE EXCEPTION 'SUPABASE_SERVICE_ROLE_KEY not found in vault';
  END IF;
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/fusionpbx-proxy',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || _key
    ),
    body := jsonb_build_object('action','sync-all','organization_id',_org_id)
  ) INTO _req_id;
  RETURN _req_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trigger_pbx_sync(uuid) FROM PUBLIC, anon, authenticated;