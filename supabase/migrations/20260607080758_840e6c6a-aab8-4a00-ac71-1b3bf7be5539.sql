REVOKE SELECT (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
REVOKE UPDATE (sip_password) ON public.pbx_softphone_users FROM authenticated, anon;
-- Re-assert protection on lemtel_softphone_users if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lemtel_softphone_users' AND column_name='sip_password'
  ) THEN
    EXECUTE 'REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon';
    EXECUTE 'REVOKE UPDATE (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon';
  END IF;
END $$;