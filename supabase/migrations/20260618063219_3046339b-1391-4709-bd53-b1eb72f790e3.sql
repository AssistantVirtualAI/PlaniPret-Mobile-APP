CREATE TABLE IF NOT EXISTS public.provider_credentials_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_user_id uuid,
  actor_email text,
  provider text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete','view','reveal','test')),
  field_changed text,
  ip text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_credentials_audit TO authenticated;
GRANT ALL ON public.provider_credentials_audit TO service_role;

ALTER TABLE public.provider_credentials_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read provider audit"
  ON public.provider_credentials_audit
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND (
        public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
        OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_provider_audit_org_created
  ON public.provider_credentials_audit (organization_id, created_at DESC);

ALTER TABLE public.pbx_call_records REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pbx_call_records'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_records';
  END IF;
END $$;

ALTER TABLE public.lemtel_config
  ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_version smallint;