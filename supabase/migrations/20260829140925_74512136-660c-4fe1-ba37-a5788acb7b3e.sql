-- 1. billing_plans: restrict catalog reads to admins (no client-side usage)
DROP POLICY IF EXISTS "billing_plans_read_authenticated" ON public.billing_plans;
CREATE POLICY "billing_plans_read_admin" ON public.billing_plans
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_planipret_admin(auth.uid()));

-- 2. mobile_app_releases: restrict bundle metadata reads to admins
DROP POLICY IF EXISTS "mobile_releases_read" ON public.mobile_app_releases;
CREATE POLICY "mobile_releases_read_admin" ON public.mobile_app_releases
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_planipret_admin(auth.uid()));

-- 3. org_chat_channels: validate the members array server-side for every channel type
CREATE OR REPLACE FUNCTION public.enforce_org_chat_channel_member_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  changed boolean;
  invalid uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    changed := (COALESCE(NEW.members,'{}'::uuid[]) <> COALESCE(OLD.members,'{}'::uuid[]));
  ELSE
    changed := COALESCE(array_length(NEW.members, 1), 0) > 0;
  END IF;

  IF changed THEN
    -- Only the creator, an org admin, or a super admin may change membership.
    IF TG_OP = 'UPDATE' AND NOT (
      actor = OLD.created_by
      OR public.has_role(actor, NEW.organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(actor)
    ) THEN
      RAISE EXCEPTION 'Only the channel creator or an org admin can modify members of this channel';
    END IF;

    -- Every listed member must belong to the channel organization.
    SELECT m INTO invalid
    FROM unnest(COALESCE(NEW.members, '{}'::uuid[])) AS m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = m AND om.organization_id = NEW.organization_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_members om2
      WHERE om2.user_id = m AND om2.organization_id = NEW.organization_id
    )
    LIMIT 1;

    IF invalid IS NOT NULL THEN
      RAISE EXCEPTION 'User % is not a member of this organization', invalid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_org_chat_channel_member_changes ON public.org_chat_channels;
CREATE TRIGGER enforce_org_chat_channel_member_changes
  BEFORE INSERT OR UPDATE ON public.org_chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_chat_channel_member_changes();

-- 4. leads: keep org+role scoping, add explicit organization membership requirement on writes
DROP POLICY IF EXISTS "Managers can create organization leads" ON public.leads;
CREATE POLICY "Managers can create organization leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id
      )
      AND (
        public.has_role(auth.uid(), organization_id, 'manager'::app_role)
        OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      )
    )
  );