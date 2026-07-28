DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT INSERT, UPDATE, SELECT ON public.planipret_did_assignments TO sandbox_exec';
  END IF;
END $$;