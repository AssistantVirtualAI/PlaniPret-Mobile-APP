
-- Add reseller_id (direct parent reseller, separate from parent_org_id which can be any ancestor)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_organizations_reseller_id ON public.organizations(reseller_id);
CREATE INDEX IF NOT EXISTS idx_organizations_parent_org_id ON public.organizations(parent_org_id);

-- Expand org_members role values
ALTER TABLE public.org_members DROP CONSTRAINT IF EXISTS org_members_role_check;
ALTER TABLE public.org_members ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('ava_admin','master_admin','reseller_admin','customer_admin','agent','user'));

CREATE INDEX IF NOT EXISTS idx_org_members_user_role ON public.org_members(user_id, role);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id);
