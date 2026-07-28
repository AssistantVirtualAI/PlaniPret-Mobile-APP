-- Allow recording denied attempts
ALTER TABLE public.provider_credentials_audit
  DROP CONSTRAINT IF EXISTS provider_credentials_audit_action_check;
ALTER TABLE public.provider_credentials_audit
  ADD CONSTRAINT provider_credentials_audit_action_check
  CHECK (action IN ('create','update','delete','view','reveal','test','denied'));

-- Revoke any anon access; client may only SELECT (governed by RLS), never write.
REVOKE ALL ON public.provider_credentials_audit FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.provider_credentials_audit FROM authenticated;
GRANT SELECT ON public.provider_credentials_audit TO authenticated;
GRANT ALL ON public.provider_credentials_audit TO service_role;

-- Explicit deny policies for INSERT/UPDATE/DELETE from the client (service_role bypasses RLS).
DROP POLICY IF EXISTS "Block client writes on provider audit" ON public.provider_credentials_audit;
CREATE POLICY "Block client writes on provider audit"
  ON public.provider_credentials_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block client updates on provider audit" ON public.provider_credentials_audit;
CREATE POLICY "Block client updates on provider audit"
  ON public.provider_credentials_audit
  FOR UPDATE
  TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Block client deletes on provider audit" ON public.provider_credentials_audit;
CREATE POLICY "Block client deletes on provider audit"
  ON public.provider_credentials_audit
  FOR DELETE
  TO authenticated
  USING (false);

-- Harden lemtel_config — provider credentials live here. Limit to admins.
REVOKE ALL ON public.lemtel_config FROM anon;

DROP POLICY IF EXISTS "Admins manage lemtel_config" ON public.lemtel_config;
CREATE POLICY "Admins manage lemtel_config"
  ON public.lemtel_config
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('org_admin'::app_role, 'manager'::app_role)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('org_admin'::app_role, 'manager'::app_role)
    )
  );
