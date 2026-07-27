DO $$
DECLARE
  sensitive text[] := ARRAY[
    'ms365_access_token','ms365_refresh_token','ns_jwt','ns_refresh_token',
    'maestro_refresh_token','maestro_broker_token','sip_password',
    'ns_sip_password_ref','ns_sip_password_ref_mobile'
  ];
  safe_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO safe_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'planipret_profiles'
    AND NOT (column_name = ANY(sensitive));

  REVOKE SELECT, UPDATE, INSERT ON public.planipret_profiles FROM authenticated;
  REVOKE ALL ON public.planipret_profiles FROM anon;

  EXECUTE format('GRANT SELECT (%s) ON public.planipret_profiles TO authenticated', safe_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.planipret_profiles TO authenticated', safe_cols);
  EXECUTE format('GRANT INSERT (%s) ON public.planipret_profiles TO authenticated', safe_cols);
END $$;

GRANT DELETE ON public.planipret_profiles TO authenticated;
GRANT ALL ON public.planipret_profiles TO service_role;