
-- 1. lemtel_softphone_users: restrict SELECT + revoke sip_password column
DROP POLICY IF EXISTS "lemtel members read softphone users" ON public.lemtel_softphone_users;
CREATE POLICY "users read own softphone, admins read all"
  ON public.lemtel_softphone_users FOR SELECT TO authenticated
  USING (portal_user_id = auth.uid() OR public.is_lemtel_admin(auth.uid()));
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;

-- 2. agent_platform_webhooks: revoke webhook_secret column
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;

-- 3. lemtel_config: revoke value column from authenticated (read via service role only)
REVOKE SELECT (value) ON public.lemtel_config FROM authenticated, anon;

-- 4. pbx_integrations: revoke config column from authenticated
REVOKE SELECT (config) ON public.pbx_integrations FROM authenticated, anon;

-- 5. lemtel_cdrs_cache: scope SELECT to admin or owning customer's portal user
DROP POLICY IF EXISTS "lemtel members read cdrs" ON public.lemtel_cdrs_cache;
CREATE POLICY "admins or owning customer read cdrs"
  ON public.lemtel_cdrs_cache FOR SELECT TO authenticated
  USING (
    public.is_lemtel_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.id = lemtel_cdrs_cache.customer_id
        AND c.portal_user_id = auth.uid()
    )
  );

-- 6. lemtel_sms_threads: scope SELECT and writes
DROP POLICY IF EXISTS "lemtel members read sms" ON public.lemtel_sms_threads;
DROP POLICY IF EXISTS "lemtel members write sms" ON public.lemtel_sms_threads;
CREATE POLICY "admins or owning customer read sms"
  ON public.lemtel_sms_threads FOR SELECT TO authenticated
  USING (
    public.is_lemtel_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.id = lemtel_sms_threads.customer_id
        AND c.portal_user_id = auth.uid()
    )
  );
CREATE POLICY "admins manage sms"
  ON public.lemtel_sms_threads FOR ALL TO authenticated
  USING (public.is_lemtel_admin(auth.uid()))
  WITH CHECK (public.is_lemtel_admin(auth.uid()));
CREATE POLICY "owning customer writes sms"
  ON public.lemtel_sms_threads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.id = lemtel_sms_threads.customer_id
        AND c.portal_user_id = auth.uid()
    )
  );

-- 7. Storage policies for private lemtel buckets
CREATE POLICY "lemtel members read ivr audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lemtel-ivr-audio' AND public.is_lemtel_member(auth.uid()));
CREATE POLICY "lemtel admins write ivr audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lemtel-ivr-audio' AND public.is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins update ivr audio"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lemtel-ivr-audio' AND public.is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins delete ivr audio"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lemtel-ivr-audio' AND public.is_lemtel_admin(auth.uid()));

CREATE POLICY "lemtel admins read recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lemtel-recordings' AND public.is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins write recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lemtel-recordings' AND public.is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins update recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lemtel-recordings' AND public.is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins delete recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lemtel-recordings' AND public.is_lemtel_admin(auth.uid()));
