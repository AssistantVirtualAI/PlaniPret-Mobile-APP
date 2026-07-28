-- Fix: create export history, notifications, and custom role permissions

-- 1) Export runs/history
CREATE TABLE IF NOT EXISTS public.org_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  export_type text NOT NULL,
  format text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  filename text NOT NULL,
  mime text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can view org exports" ON public.org_exports;
CREATE POLICY "Org admins can view org exports"
ON public.org_exports
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.has_role(auth.uid(), organization_id, 'org_admin')
  )
);

DROP POLICY IF EXISTS "Service role can insert org exports" ON public.org_exports;
CREATE POLICY "Service role can insert org exports"
ON public.org_exports
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update org exports" ON public.org_exports;
CREATE POLICY "Service role can update org exports"
ON public.org_exports
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can delete org exports" ON public.org_exports;
CREATE POLICY "Service role can delete org exports"
ON public.org_exports
FOR DELETE
USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_org_exports_org_created_at ON public.org_exports(organization_id, created_at DESC);


-- 2) In-app notifications
CREATE TABLE IF NOT EXISTS public.org_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recipient_role public.app_role NULL,
  recipient_user_id uuid NULL,
  level text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients can view org notifications" ON public.org_notifications;
CREATE POLICY "Recipients can view org notifications"
ON public.org_notifications
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      (recipient_user_id IS NOT NULL AND recipient_user_id = auth.uid())
      OR (
        recipient_user_id IS NULL
        AND recipient_role IS NOT NULL
        AND public.has_role(auth.uid(), organization_id, recipient_role)
      )
    )
  )
);

DROP POLICY IF EXISTS "Recipients can mark notifications read" ON public.org_notifications;
CREATE POLICY "Recipients can mark notifications read"
ON public.org_notifications
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      (recipient_user_id IS NOT NULL AND recipient_user_id = auth.uid())
      OR (
        recipient_user_id IS NULL
        AND recipient_role IS NOT NULL
        AND public.has_role(auth.uid(), organization_id, recipient_role)
      )
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      (recipient_user_id IS NOT NULL AND recipient_user_id = auth.uid())
      OR (
        recipient_user_id IS NULL
        AND recipient_role IS NOT NULL
        AND public.has_role(auth.uid(), organization_id, recipient_role)
      )
    )
  )
);

DROP POLICY IF EXISTS "Service role can insert org notifications" ON public.org_notifications;
CREATE POLICY "Service role can insert org notifications"
ON public.org_notifications
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can delete org notifications" ON public.org_notifications;
CREATE POLICY "Service role can delete org notifications"
ON public.org_notifications
FOR DELETE
USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_org_notifications_org_created_at ON public.org_notifications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_notifications_read_at ON public.org_notifications(read_at);


-- 3) Fine-grained permission overrides
CREATE TABLE IF NOT EXISTS public.org_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  role public.app_role NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, permission)
);

ALTER TABLE public.org_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and managers can view role permissions" ON public.org_role_permissions;
CREATE POLICY "Admins and managers can view role permissions"
ON public.org_role_permissions
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (public.has_role(auth.uid(), organization_id, 'org_admin') OR public.has_role(auth.uid(), organization_id, 'manager'))
  )
);

DROP POLICY IF EXISTS "Org admins can insert role permissions" ON public.org_role_permissions;
CREATE POLICY "Org admins can insert role permissions"
ON public.org_role_permissions
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.has_role(auth.uid(), organization_id, 'org_admin')
  )
);

DROP POLICY IF EXISTS "Org admins can update role permissions" ON public.org_role_permissions;
CREATE POLICY "Org admins can update role permissions"
ON public.org_role_permissions
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.has_role(auth.uid(), organization_id, 'org_admin')
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.has_role(auth.uid(), organization_id, 'org_admin')
  )
);

DROP POLICY IF EXISTS "Org admins can delete role permissions" ON public.org_role_permissions;
CREATE POLICY "Org admins can delete role permissions"
ON public.org_role_permissions
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.has_role(auth.uid(), organization_id, 'org_admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_org_role_permissions_org_role ON public.org_role_permissions(organization_id, role);


-- 4) Maintain updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_org_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_org_role_permissions ON public.org_role_permissions;
CREATE TRIGGER trg_set_updated_at_org_role_permissions
BEFORE UPDATE ON public.org_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_org_role_permissions();
