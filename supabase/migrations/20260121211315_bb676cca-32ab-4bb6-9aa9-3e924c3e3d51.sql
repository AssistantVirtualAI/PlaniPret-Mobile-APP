-- Retention settings for exports and notifications

CREATE TABLE IF NOT EXISTS public.org_retention_settings (
  organization_id uuid PRIMARY KEY,
  exports_retention_days integer NOT NULL DEFAULT 90,
  notifications_retention_days integer NOT NULL DEFAULT 90,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_retention_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view retention settings" ON public.org_retention_settings;
CREATE POLICY "Admins can view retention settings"
ON public.org_retention_settings
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  OR has_role(auth.uid(), organization_id, 'manager'::app_role)
);

DROP POLICY IF EXISTS "Org admins can manage retention settings" ON public.org_retention_settings;
CREATE POLICY "Org admins can manage retention settings"
ON public.org_retention_settings
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins can update retention settings" ON public.org_retention_settings;
CREATE POLICY "Org admins can update retention settings"
ON public.org_retention_settings
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins can delete retention settings" ON public.org_retention_settings;
CREATE POLICY "Org admins can delete retention settings"
ON public.org_retention_settings
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_org_notifications_org_created_at_desc ON public.org_notifications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_exports_org_created_at_desc ON public.org_exports(organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_org_retention_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_org_retention_settings ON public.org_retention_settings;
CREATE TRIGGER trg_set_updated_at_org_retention_settings
BEFORE UPDATE ON public.org_retention_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_org_retention_settings();
