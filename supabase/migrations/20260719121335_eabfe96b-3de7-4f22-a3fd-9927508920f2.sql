
-- 1) Prevent privilege escalation on org_members: block non-master admins from
--    modifying permission flags on their OWN row.
CREATE OR REPLACE FUNCTION public.prevent_org_members_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_master_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id = auth.uid() AND (
      COALESCE(NEW.can_manage_users, false)
      OR COALESCE(NEW.can_manage_billing, false)
      OR COALESCE(NEW.can_manage_resellers, false)
      OR COALESCE(NEW.can_white_label, false)
      OR COALESCE(NEW.access_all_children, false)
    ) THEN
      RAISE EXCEPTION 'Cannot self-grant elevated org permissions';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id = auth.uid() AND (
      COALESCE(NEW.can_manage_users, false)   IS DISTINCT FROM COALESCE(OLD.can_manage_users, false)
      OR COALESCE(NEW.can_manage_billing, false)   IS DISTINCT FROM COALESCE(OLD.can_manage_billing, false)
      OR COALESCE(NEW.can_manage_resellers, false) IS DISTINCT FROM COALESCE(OLD.can_manage_resellers, false)
      OR COALESCE(NEW.can_white_label, false)      IS DISTINCT FROM COALESCE(OLD.can_white_label, false)
      OR COALESCE(NEW.access_all_children, false)  IS DISTINCT FROM COALESCE(OLD.access_all_children, false)
      OR NEW.role IS DISTINCT FROM OLD.role
    ) THEN
      RAISE EXCEPTION 'Cannot self-modify elevated org permissions or role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_org_members_self_escalation ON public.org_members;
CREATE TRIGGER trg_prevent_org_members_self_escalation
  BEFORE INSERT OR UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_org_members_self_escalation();

-- 2) Prevent Planiprêt users from changing their own role (privilege escalation
--    vector referenced by DID assignments finding).
CREATE OR REPLACE FUNCTION public.prevent_planipret_profile_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_planipret_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pp_profile_role_self_change ON public.planipret_profiles;
CREATE TRIGGER trg_prevent_pp_profile_role_self_change
  BEFORE UPDATE ON public.planipret_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_planipret_profile_role_self_change();

-- 3) Standardize planipret_did_assignments policies on is_planipret_admin().
DROP POLICY IF EXISTS "Planipret admins delete DID assignments" ON public.planipret_did_assignments;
DROP POLICY IF EXISTS "Planipret admins insert DID assignments" ON public.planipret_did_assignments;
DROP POLICY IF EXISTS "Planipret admins read DID assignments"   ON public.planipret_did_assignments;
DROP POLICY IF EXISTS "Planipret admins update DID assignments" ON public.planipret_did_assignments;

CREATE POLICY "Planipret admins read DID assignments"
  ON public.planipret_did_assignments FOR SELECT
  USING (public.is_planipret_admin(auth.uid()));

CREATE POLICY "Planipret admins insert DID assignments"
  ON public.planipret_did_assignments FOR INSERT
  WITH CHECK (public.is_planipret_admin(auth.uid()));

CREATE POLICY "Planipret admins update DID assignments"
  ON public.planipret_did_assignments FOR UPDATE
  USING (public.is_planipret_admin(auth.uid()))
  WITH CHECK (public.is_planipret_admin(auth.uid()));

CREATE POLICY "Planipret admins delete DID assignments"
  ON public.planipret_did_assignments FOR DELETE
  USING (public.is_planipret_admin(auth.uid()));

-- 4) Standardize planipret_ava_sessions admin read policy on is_planipret_admin().
DROP POLICY IF EXISTS "admins_view_all_sessions" ON public.planipret_ava_sessions;
CREATE POLICY "admins_view_all_sessions"
  ON public.planipret_ava_sessions FOR SELECT
  USING (public.is_planipret_admin(auth.uid()));
