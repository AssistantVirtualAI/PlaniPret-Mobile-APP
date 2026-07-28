
-- 1. app_releases: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can read app releases" ON public.app_releases;
CREATE POLICY "Authenticated can read app releases"
ON public.app_releases FOR SELECT TO authenticated USING (true);

-- 2. billing_plans: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "billing_plans_read_all" ON public.billing_plans;
CREATE POLICY "billing_plans_read_authenticated"
ON public.billing_plans FOR SELECT TO authenticated USING (true);

-- 3. platform_branding: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "platform_branding readable by everyone" ON public.platform_branding;
CREATE POLICY "platform_branding readable by authenticated"
ON public.platform_branding FOR SELECT TO authenticated USING (true);

-- 4. lemtel_cdrs_cache: split ALL policy into explicit per-command admin policies
DROP POLICY IF EXISTS "lemtel admins manage cdrs" ON public.lemtel_cdrs_cache;
CREATE POLICY "lemtel admins insert cdrs"
ON public.lemtel_cdrs_cache FOR INSERT TO authenticated
WITH CHECK (is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins update cdrs"
ON public.lemtel_cdrs_cache FOR UPDATE TO authenticated
USING (is_lemtel_admin(auth.uid()))
WITH CHECK (is_lemtel_admin(auth.uid()));
CREATE POLICY "lemtel admins delete cdrs"
ON public.lemtel_cdrs_cache FOR DELETE TO authenticated
USING (is_lemtel_admin(auth.uid()));

-- 5. organization_members: prevent users from tampering with membership fields
-- Replace UPDATE policy + add trigger enforcing column-level immutability.
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.organization_members;
CREATE POLICY "Users can accept their own invitations"
ON public.organization_members FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_org_member_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins/super_admins to update any field on rows they can update.
  IF is_super_admin(auth.uid())
     OR has_role(auth.uid(), NEW.organization_id, 'org_admin'::app_role)
     OR has_role(auth.uid(), NEW.organization_id, 'manager'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For the row's own user (self-update), only accepted_at may change.
  IF NEW.user_id = auth.uid() AND OLD.user_id = auth.uid() THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
       OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
       OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Only accepted_at can be updated on your own membership row';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update this membership row';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_org_member_self_update ON public.organization_members;
CREATE TRIGGER trg_enforce_org_member_self_update
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_member_self_update();
