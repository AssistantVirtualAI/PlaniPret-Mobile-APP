
-- 1) org_chat_channels: restrict UPDATE to creator / org_admin / super_admin only
DROP POLICY IF EXISTS "channel update restricted" ON public.org_chat_channels;

CREATE POLICY "channel update restricted"
ON public.org_chat_channels
FOR UPDATE
USING (
  (organization_id IN (SELECT current_user_org_ids()))
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  )
)
WITH CHECK (
  (organization_id IN (SELECT current_user_org_ids()))
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  )
);

-- 2) organizations: block changes to sensitive columns unless super/master admin
CREATE OR REPLACE FUNCTION public.protect_organization_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.is_super_admin(auth.uid())
                   OR public.is_master_admin(auth.uid());

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.is_internal    IS DISTINCT FROM OLD.is_internal
     OR NEW.org_level   IS DISTINCT FROM OLD.org_level
     OR NEW.org_type    IS DISTINCT FROM OLD.org_type
     OR NEW.parent_org_id IS DISTINCT FROM OLD.parent_org_id
     OR NEW.root_org_id IS DISTINCT FROM OLD.root_org_id
     OR NEW.max_extensions IS DISTINCT FROM OLD.max_extensions
     OR NEW.max_dids    IS DISTINCT FROM OLD.max_dids
     OR NEW.max_storage IS DISTINCT FROM OLD.max_storage
     OR NEW.billing_plan IS DISTINCT FROM OLD.billing_plan
     OR NEW.client_limit IS DISTINCT FROM OLD.client_limit
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
  THEN
    RAISE EXCEPTION 'Modification of protected organization attributes is not allowed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_organization_sensitive_columns_trg ON public.organizations;
CREATE TRIGGER protect_organization_sensitive_columns_trg
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organization_sensitive_columns();
