
-- ============================================================
-- PHASE 1: Multi-tenant reseller architecture
-- ============================================================

-- 1. Extend organizations table
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS parent_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_level integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS org_type text DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text,
  ADD COLUMN IF NOT EXISTS brand_primary_color text DEFAULT '#003DA6',
  ADD COLUMN IF NOT EXISTS brand_accent_color text DEFAULT '#FFD700',
  ADD COLUMN IF NOT EXISTS brand_favicon_url text,
  ADD COLUMN IF NOT EXISTS brand_portal_domain text,
  ADD COLUMN IF NOT EXISTS brand_app_name text DEFAULT 'Lemtel Telecom',
  ADD COLUMN IF NOT EXISTS brand_support_email text,
  ADD COLUMN IF NOT EXISTS brand_support_phone text,
  ADD COLUMN IF NOT EXISTS brand_website text,
  ADD COLUMN IF NOT EXISTS fusionpbx_domain_uuid text,
  ADD COLUMN IF NOT EXISTS fusionpbx_domain_name text,
  ADD COLUMN IF NOT EXISTS fusionpbx_server_url text,
  ADD COLUMN IF NOT EXISTS max_extensions integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_dids integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_storage_gb integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_resellers integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_plan text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS idx_organizations_parent ON public.organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_root ON public.organizations(root_org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_brand_domain ON public.organizations(brand_portal_domain);

-- Promote Lemtel to master
UPDATE public.organizations
   SET org_level = 1,
       org_type = 'master',
       brand_name = COALESCE(brand_name, 'Lemtel Telecom'),
       brand_primary_color = COALESCE(brand_primary_color, '#003DA6'),
       brand_accent_color = COALESCE(brand_accent_color, '#FFD700'),
       max_extensions = 500,
       max_dids = 100,
       max_storage_gb = 500,
       max_resellers = -1,
       status = 'active'
 WHERE id = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

-- Backfill root_org_id for orgs that have no parent
UPDATE public.organizations
   SET root_org_id = id
 WHERE root_org_id IS NULL AND parent_org_id IS NULL;

-- 2. billing_plans
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  max_extensions integer DEFAULT 10,
  max_dids integer DEFAULT 2,
  max_storage_gb integer DEFAULT 5,
  max_resellers integer DEFAULT 0,
  price_monthly numeric(10,2),
  features jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.billing_plans TO anon, authenticated;
GRANT ALL ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_plans_read_all" ON public.billing_plans FOR SELECT USING (true);

INSERT INTO public.billing_plans (id, name, max_extensions, max_dids, max_storage_gb, max_resellers, price_monthly, features) VALUES
  ('starter','Starter',5,1,2,0,29.99,'{"callCenter":false,"aiInsights":false,"smsMessaging":true,"callRecording":true,"teamChat":true,"videoCall":false,"crmIntegration":false,"apiAccess":false,"whiteLabel":false,"customDomain":false}'::jsonb),
  ('basic','Basic',10,2,5,0,49.99,'{"callCenter":false,"aiInsights":true,"smsMessaging":true,"callRecording":true,"teamChat":true,"videoCall":false,"crmIntegration":false,"apiAccess":false,"whiteLabel":false,"customDomain":false}'::jsonb),
  ('professional','Professional',50,10,25,0,149.99,'{"callCenter":true,"aiInsights":true,"smsMessaging":true,"callRecording":true,"teamChat":true,"videoCall":true,"crmIntegration":true,"apiAccess":true,"whiteLabel":false,"customDomain":false}'::jsonb),
  ('reseller','Reseller',100,20,50,10,299.99,'{"callCenter":true,"aiInsights":true,"smsMessaging":true,"callRecording":true,"teamChat":true,"videoCall":true,"crmIntegration":true,"apiAccess":true,"whiteLabel":true,"customDomain":true}'::jsonb),
  ('enterprise','Enterprise',-1,-1,-1,-1,0,'{"callCenter":true,"aiInsights":true,"smsMessaging":true,"callRecording":true,"teamChat":true,"videoCall":true,"crmIntegration":true,"apiAccess":true,"whiteLabel":true,"customDomain":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. org_members
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  can_manage_users boolean DEFAULT false,
  can_manage_extensions boolean DEFAULT false,
  can_manage_billing boolean DEFAULT false,
  can_manage_resellers boolean DEFAULT false,
  can_view_recordings boolean DEFAULT true,
  can_manage_ivr boolean DEFAULT false,
  can_manage_queues boolean DEFAULT false,
  can_listen_calls boolean DEFAULT false,
  can_export_data boolean DEFAULT false,
  can_white_label boolean DEFAULT false,
  access_all_children boolean DEFAULT false,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz DEFAULT now(),
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Security definer helpers
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND role = 'master_admin'
  ) OR public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_org_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Master/super admin sees everything
  IF public.is_master_admin(_user_id) THEN
    RETURN QUERY SELECT id FROM public.organizations;
    RETURN;
  END IF;

  -- Direct memberships + descendants for members with access_all_children
  RETURN QUERY
  WITH direct AS (
    SELECT org_id, access_all_children FROM public.org_members WHERE user_id = _user_id
    UNION
    SELECT organization_id AS org_id, false FROM public.organization_members WHERE user_id = _user_id
  ),
  expanded AS (
    SELECT org_id FROM direct
    UNION
    SELECT o.id
      FROM public.organizations o
      JOIN direct d ON d.access_all_children = true
     WHERE o.parent_org_id = d.org_id OR o.root_org_id = d.org_id
  )
  SELECT DISTINCT org_id FROM expanded WHERE org_id IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org_id IN (SELECT public.get_accessible_org_ids(_user_id))
$$;

-- 5. RLS on organizations (additive — keep existing policies)
DROP POLICY IF EXISTS "org_v4_accessible_select" ON public.organizations;
CREATE POLICY "org_v4_accessible_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.can_access_org(auth.uid(), id));

DROP POLICY IF EXISTS "org_v4_master_update" ON public.organizations;
CREATE POLICY "org_v4_master_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(), id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "org_v4_master_insert" ON public.organizations;
CREATE POLICY "org_v4_master_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid() AND can_manage_resellers = true
  ));

-- 6. RLS on org_members
CREATE POLICY "org_members_self_read" ON public.org_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_org(auth.uid(), org_id));

CREATE POLICY "org_members_admin_write" ON public.org_members
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = auth.uid() AND m.org_id = org_members.org_id AND m.can_manage_users = true
  ))
  WITH CHECK (public.is_master_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = auth.uid() AND m.org_id = org_members.org_id AND m.can_manage_users = true
  ));

-- 7. Extend audit_logs (table already exists)
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS user_org_id uuid,
  ADD COLUMN IF NOT EXISTS impersonator_id uuid,
  ADD COLUMN IF NOT EXISTS impersonated_org_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- 8. Mirror existing memberships into org_members (idempotent)
INSERT INTO public.org_members (
  org_id, user_id, role,
  can_manage_users, can_manage_extensions, can_manage_billing, can_manage_resellers,
  can_view_recordings, can_manage_ivr, can_manage_queues, can_listen_calls,
  can_export_data, can_white_label, access_all_children
)
SELECT
  om.organization_id,
  om.user_id,
  CASE
    WHEN public.is_super_admin(om.user_id) THEN 'master_admin'
    WHEN ur.role = 'org_admin' THEN 'customer_admin'
    ELSE 'user'
  END,
  COALESCE(ur.role = 'org_admin', false),
  COALESCE(ur.role = 'org_admin', false),
  COALESCE(ur.role = 'org_admin', false),
  public.is_super_admin(om.user_id),
  true,
  COALESCE(ur.role = 'org_admin', false),
  COALESCE(ur.role = 'org_admin', false),
  COALESCE(ur.role = 'org_admin', false),
  COALESCE(ur.role = 'org_admin', false),
  public.is_super_admin(om.user_id),
  public.is_super_admin(om.user_id)
FROM public.organization_members om
LEFT JOIN public.user_roles ur ON ur.user_id = om.user_id AND ur.organization_id = om.organization_id
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 9. Promote super_admins of Lemtel to master_admin in org_members
UPDATE public.org_members
   SET role = 'master_admin',
       access_all_children = true,
       can_manage_users = true,
       can_manage_extensions = true,
       can_manage_billing = true,
       can_manage_resellers = true,
       can_manage_ivr = true,
       can_manage_queues = true,
       can_listen_calls = true,
       can_export_data = true,
       can_white_label = true
 WHERE org_id = '71755d33-ed64-4ad5-a828-61c9d2029eb7'
   AND public.is_super_admin(user_id);
