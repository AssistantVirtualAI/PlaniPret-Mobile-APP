DROP POLICY IF EXISTS "domain users read same softphone directory" ON public.pbx_softphone_users;
CREATE POLICY "domain users read same softphone directory"
ON public.pbx_softphone_users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pbx_softphone_users self
    WHERE self.portal_user_id = auth.uid()
      AND self.organization_id = pbx_softphone_users.organization_id
      AND COALESCE(self.domain_uuid::text, '') = COALESCE(pbx_softphone_users.domain_uuid::text, '')
      AND COALESCE(self.domain_uuid::text, '') <> ''
  )
  OR portal_user_id = auth.uid()
);

ALTER TABLE public.pbx_softphone_users REPLICA IDENTITY FULL;
ALTER TABLE public.user_presence REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pbx_softphone_users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_softphone_users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
  END IF;
END $$;