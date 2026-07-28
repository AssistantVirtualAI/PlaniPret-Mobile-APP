-- Phase 1: Database Migrations

-- =====================================================
-- 1. Extend organizations table (workspaces)
-- =====================================================
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS api_key VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS logo_dashboard_url TEXT,
ADD COLUMN IF NOT EXISTS logo_login_url TEXT,
ADD COLUMN IF NOT EXISTS favicon_url TEXT,
ADD COLUMN IF NOT EXISTS website_title VARCHAR(255),
ADD COLUMN IF NOT EXISTS loading_icon VARCHAR(50) DEFAULT 'infinity',
ADD COLUMN IF NOT EXISTS loading_icon_size VARCHAR(10) DEFAULT 'md',
ADD COLUMN IF NOT EXISTS backend_domain VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_sender VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_sender_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_logo_url TEXT,
ADD COLUMN IF NOT EXISTS gdpr_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hipaa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS client_limit INT DEFAULT 3;

-- =====================================================
-- 2. Extend clients table
-- =====================================================
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS login_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'fr',
ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'light',
ADD COLUMN IF NOT EXISTS custom_css TEXT,
ADD COLUMN IF NOT EXISTS access_controls JSONB DEFAULT '{}';

-- Update login_id from username for existing records
UPDATE public.clients SET login_id = username WHERE login_id IS NULL AND username IS NOT NULL;

-- =====================================================
-- 3. Extend agents table
-- =====================================================
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS platform_api_key TEXT,
ADD COLUMN IF NOT EXISTS platform_agent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS widget_layout VARCHAR(50) DEFAULT 'original',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS branding_url TEXT,
ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}';

-- Create index on client_id for agents
CREATE INDEX IF NOT EXISTS idx_agents_client_id ON public.agents(client_id);

-- =====================================================
-- 4. Extend profiles table
-- =====================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS locale VARCHAR(5) DEFAULT 'fr';

-- =====================================================
-- 5. Extend billing_config table
-- =====================================================
ALTER TABLE public.billing_config 
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- =====================================================
-- 6. Extend conversations table
-- =====================================================
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS label_variable VARCHAR(255),
ADD COLUMN IF NOT EXISTS default_label VARCHAR(255);

-- Create indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON public.conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON public.conversations(client_id);

-- =====================================================
-- 7. Create client_members table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, email)
);

-- Enable RLS on client_members
ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_members
CREATE POLICY "Users can view client members of their organization"
ON public.client_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = client_members.client_id AND om.user_id = auth.uid()
  )
);

CREATE POLICY "Org admins can manage client members"
ON public.client_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_members.client_id
    AND (
      has_role(auth.uid(), c.organization_id, 'org_admin'::app_role) OR
      has_role(auth.uid(), c.organization_id, 'manager'::app_role) OR
      is_super_admin(auth.uid())
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_members.client_id
    AND (
      has_role(auth.uid(), c.organization_id, 'org_admin'::app_role) OR
      has_role(auth.uid(), c.organization_id, 'manager'::app_role) OR
      is_super_admin(auth.uid())
    )
  )
);

-- =====================================================
-- 8. Create workflows table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_name VARCHAR(255) NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- RLS policies for workflows
CREATE POLICY "Users can view organization workflows"
ON public.workflows FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = workflows.organization_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Org admins can manage workflows"
ON public.workflows FOR ALL
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR
  is_super_admin(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR
  is_super_admin(auth.uid())
);

-- =====================================================
-- 9. Create email_templates table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_type VARCHAR(100) NOT NULL,
  subject VARCHAR(255),
  greeting TEXT,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, template_type)
);

-- Enable RLS on email_templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_templates
CREATE POLICY "Users can view organization email templates"
ON public.email_templates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = email_templates.organization_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Org admins can manage email templates"
ON public.email_templates FOR ALL
USING (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  is_super_admin(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  is_super_admin(auth.uid())
);

-- =====================================================
-- 10. Create updated_at triggers for new tables
-- =====================================================
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 11. Generate API key function for organizations
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key TEXT;
BEGIN
  key := 'sk_' || encode(gen_random_bytes(32), 'hex');
  RETURN key;
END;
$$;