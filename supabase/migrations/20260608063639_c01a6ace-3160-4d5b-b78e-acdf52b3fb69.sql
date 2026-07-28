
-- 1) Add is_internal flag to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_is_internal ON public.organizations(is_internal);

-- 2) Mark AVA Main Dashboard + Lemtel Communications as internal (AVA-managed, hidden from tenants)
UPDATE public.organizations
   SET is_internal = true
 WHERE id IN (
   '17d6507f-a9ca-409d-8e49-371d50332615'::uuid,
   '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid
 );

-- 3) Helper: can the user see an internal org? Only super_admins / lemtel members / direct members of that org.
CREATE OR REPLACE FUNCTION public.can_view_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- internal org rule
    CASE
      WHEN EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.is_internal = true)
      THEN
        public.is_super_admin(_user_id)
        OR public.is_lemtel_member(_user_id)
        OR EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = _org_id AND user_id = _user_id
        )
      ELSE
        -- non-internal org: existing accessibility model
        public.can_access_org(_user_id, _org_id)
        OR EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = _org_id AND user_id = _user_id
        )
    END
$$;

-- 4) Rewrite SELECT policies on organizations to hide internal orgs from outsiders
DROP POLICY IF EXISTS "Super admins can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "org_v4_accessible_select" ON public.organizations;

CREATE POLICY "orgs_visible_to_authorized"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.can_view_org(auth.uid(), id));
