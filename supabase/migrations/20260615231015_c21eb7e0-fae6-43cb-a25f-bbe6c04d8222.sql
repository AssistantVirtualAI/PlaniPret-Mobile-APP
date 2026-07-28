
-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.pbx_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  domain_uuid text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  source text NOT NULL DEFAULT 'ava',
  before_json jsonb,
  after_json jsonb,
  diff_json jsonb,
  confirmed_at timestamptz,
  result text,
  error text,
  rollback_of uuid REFERENCES public.pbx_admin_actions(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbx_admin_actions_org_created
  ON public.pbx_admin_actions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pbx_admin_actions_entity
  ON public.pbx_admin_actions (entity_type, entity_id);

GRANT SELECT, INSERT ON public.pbx_admin_actions TO authenticated;
GRANT ALL ON public.pbx_admin_actions TO service_role;

ALTER TABLE public.pbx_admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_actions_select"
  ON public.pbx_admin_actions FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  );

CREATE POLICY "admin_actions_insert"
  ON public.pbx_admin_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_lemtel_admin(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    )
  );

-- 2. Sync tracking on pbx_extensions
ALTER TABLE public.pbx_extensions
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS pbx_source text DEFAULT 'fusionpbx';

-- 3. Sync tracking on pbx_devices
ALTER TABLE public.pbx_devices
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS pbx_source text DEFAULT 'fusionpbx';
