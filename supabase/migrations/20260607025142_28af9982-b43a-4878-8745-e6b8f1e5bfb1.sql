
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM authenticated, anon;
REVOKE SELECT (platform_api_key) ON public.agents FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.calendar_integrations FROM authenticated, anon;
REVOKE SELECT (password_hash, password_reset_token) ON public.client_credentials FROM authenticated, anon;
REVOKE SELECT (sip_password) ON public.lemtel_softphone_users FROM authenticated, anon;
REVOKE SELECT (api_key) ON public.organization_integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhook_endpoints FROM authenticated, anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lemtel_sms_threads') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_sms_threads';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lemtel_softphone_users') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.lemtel_softphone_users';
  END IF;
END $$;

DROP POLICY IF EXISTS "Portal users can read own recordings" ON storage.objects;
CREATE POLICY "Portal users can read own recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lemtel-recordings'
  AND EXISTS (
    SELECT 1
    FROM public.lemtel_cdrs_cache c
    JOIN public.lemtel_customers cust ON cust.id = c.customer_id
    WHERE cust.portal_user_id = auth.uid()
      AND (
        c.record_path = storage.objects.name
        OR storage.objects.name LIKE '%' || c.id::text || '%'
      )
  )
);
