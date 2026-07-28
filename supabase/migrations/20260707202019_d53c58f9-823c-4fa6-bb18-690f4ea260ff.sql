
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.organization_members;

CREATE POLICY "Users can accept their own invitations"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND organization_id = (
    SELECT om.organization_id FROM public.organization_members om WHERE om.id = organization_members.id
  )
  AND invited_by IS NOT DISTINCT FROM (
    SELECT om.invited_by FROM public.organization_members om WHERE om.id = organization_members.id
  )
);

CREATE OR REPLACE FUNCTION public.prevent_softphone_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), OLD.organization_id, 'org_admin'::app_role)
    OR public.has_role(auth.uid(), OLD.organization_id, 'manager'::app_role)
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF OLD.portal_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  NEW.cc_role := OLD.cc_role;
  NEW.account_status := OLD.account_status;
  NEW.mobile_access_enabled := OLD.mobile_access_enabled;
  NEW.desktop_access_enabled := OLD.desktop_access_enabled;
  NEW.app_access_enabled := OLD.app_access_enabled;
  NEW.organization_id := OLD.organization_id;
  NEW.domain_uuid := OLD.domain_uuid;
  NEW.extension := OLD.extension;
  NEW.portal_user_id := OLD.portal_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_softphone_self_privilege_escalation ON public.pbx_softphone_users;
CREATE TRIGGER trg_prevent_softphone_self_privilege_escalation
BEFORE UPDATE ON public.pbx_softphone_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_softphone_self_privilege_escalation();
