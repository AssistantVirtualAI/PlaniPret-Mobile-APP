DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='planipret_profiles'
    AND column_name NOT IN (
      'maestro_broker_token','maestro_refresh_token',
      'ms365_access_token','ms365_refresh_token',
      'ns_jwt','ns_refresh_token',
      'ns_sip_password_ref','ns_sip_password_ref_mobile','sip_password'
    );

  EXECUTE format('GRANT SELECT (%s) ON public.planipret_profiles TO authenticated', cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.planipret_profiles TO authenticated', cols);
END $$;

GRANT ALL ON public.planipret_profiles TO service_role;