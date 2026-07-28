-- =====================================================
-- PHASE 1: MULTI-TENANT + RBAC FOUNDATIONS
-- =====================================================

-- 1. Create app_role enum
CREATE TYPE app_role AS ENUM ('super_admin', 'org_admin', 'manager', 'agent', 'viewer');

-- 2. Organizations/Workspaces table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#8B5CF6',
  domain TEXT UNIQUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. User Roles table (CRITICAL SECURITY)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security Definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = _role
  )
$$;

-- 5. Function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _org_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
    AND organization_id = _org_id
  LIMIT 1
$$;

-- 6. Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- 7. Organization Members table
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(user_id, organization_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 8. Organization API Keys table
CREATE TABLE public.organization_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read:analytics', 'read:conversations'],
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- 9. Add organization_id to existing tables
ALTER TABLE public.conversations ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.knowledge_base_items ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.agent_config ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.analytics ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.organization_integrations ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- 10. RLS Policies for organizations
CREATE POLICY "Super admins can view all organizations"
  ON public.organizations FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organizations.id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can insert organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (public.has_role(auth.uid(), id, 'org_admin') OR public.is_super_admin(auth.uid()));

-- 11. RLS Policies for user_roles
CREATE POLICY "Users can view roles in their organizations"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = user_roles.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can assign roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  );

-- 12. RLS Policies for organization_members
CREATE POLICY "Users can view members of their organizations"
  ON public.organization_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can invite members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.has_role(auth.uid(), organization_id, 'manager') OR
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can accept their own invitations"
  ON public.organization_members FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Org admins can remove members"
  ON public.organization_members FOR DELETE
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  );

-- 13. RLS Policies for organization_api_keys
CREATE POLICY "Org admins can manage API keys"
  ON public.organization_api_keys FOR ALL
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), organization_id, 'org_admin') OR 
    public.is_super_admin(auth.uid())
  );

-- 14. Update RLS policies for existing tables with organization_id
-- Conversations
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;

CREATE POLICY "Users can view organization conversations"
  ON public.conversations FOR SELECT
  USING (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = conversations.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create organization conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = conversations.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can update organization conversations"
  ON public.conversations FOR UPDATE
  USING (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "Managers can delete organization conversations"
  ON public.conversations FOR DELETE
  USING (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

-- Knowledge Base Items
DROP POLICY IF EXISTS "Users can view their own KB items" ON public.knowledge_base_items;
DROP POLICY IF EXISTS "Users can create their own KB items" ON public.knowledge_base_items;
DROP POLICY IF EXISTS "Users can update their own KB items" ON public.knowledge_base_items;
DROP POLICY IF EXISTS "Users can delete their own KB items" ON public.knowledge_base_items;

CREATE POLICY "Users can view organization KB items"
  ON public.knowledge_base_items FOR SELECT
  USING (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = knowledge_base_items.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can create organization KB items"
  ON public.knowledge_base_items FOR INSERT
  WITH CHECK (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = knowledge_base_items.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can update organization KB items"
  ON public.knowledge_base_items FOR UPDATE
  USING (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'agent') OR
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

CREATE POLICY "Managers can delete organization KB items"
  ON public.knowledge_base_items FOR DELETE
  USING (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

-- Agent Config
DROP POLICY IF EXISTS "Users can view own agent configs" ON public.agent_config;
DROP POLICY IF EXISTS "Users can create agent configs" ON public.agent_config;
DROP POLICY IF EXISTS "Users can update own agent configs" ON public.agent_config;
DROP POLICY IF EXISTS "Users can delete own agent configs" ON public.agent_config;

CREATE POLICY "Users can view organization agent configs"
  ON public.agent_config FOR SELECT
  USING (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = agent_config.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage organization agent configs"
  ON public.agent_config FOR ALL
  USING (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'manager') OR
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

-- Analytics
DROP POLICY IF EXISTS "Users can view own analytics" ON public.analytics;
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.analytics;

CREATE POLICY "Users can view organization analytics"
  ON public.analytics FOR SELECT
  USING (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = analytics.organization_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert organization analytics"
  ON public.analytics FOR INSERT
  WITH CHECK (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = analytics.organization_id
        AND user_id = auth.uid()
    )
  );

-- Organization Integrations
DROP POLICY IF EXISTS "Users can manage own integrations" ON public.organization_integrations;

CREATE POLICY "Org admins can manage integrations"
  ON public.organization_integrations FOR ALL
  USING (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    organization_id IS NULL AND user_id = auth.uid() OR
    organization_id IS NOT NULL AND (
      public.has_role(auth.uid(), organization_id, 'org_admin') OR
      public.is_super_admin(auth.uid())
    )
  );

-- 15. Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 16. Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_org_id ON public.user_roles(organization_id);
CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX idx_knowledge_base_items_org_id ON public.knowledge_base_items(organization_id);
CREATE INDEX idx_agent_config_org_id ON public.agent_config(organization_id);
CREATE INDEX idx_analytics_org_id ON public.analytics(organization_id);
CREATE INDEX idx_organization_integrations_org_id ON public.organization_integrations(organization_id);