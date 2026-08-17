DO $$
DECLARE f record; sig text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS ret
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    sig := format('public.%I(%s)', f.proname, f.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    IF f.ret <> 'trigger' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.planipret_integration_secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.planipret_integration_secrets TO service_role;