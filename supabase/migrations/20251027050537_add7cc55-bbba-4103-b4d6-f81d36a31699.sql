-- Create clients table for managing organization clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  assigned_agents INT DEFAULT 1,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view clients from their organizations
CREATE POLICY "Users can view organization clients"
  ON public.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = clients.organization_id
        AND user_id = auth.uid()
    )
  );

-- RLS: Org admins can insert clients
CREATE POLICY "Org admins can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = clients.organization_id
        AND user_id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

-- RLS: Org admins can update clients
CREATE POLICY "Org admins can update clients"
  ON public.clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = clients.organization_id
        AND user_id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

-- RLS: Org admins can delete clients
CREATE POLICY "Org admins can delete clients"
  ON public.clients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = clients.organization_id
        AND user_id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

-- Create billing_config table for managing organization billing
CREATE TABLE public.billing_config (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_tier TEXT DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  credits_limit INT DEFAULT 5,
  credits_used INT DEFAULT 0,
  ai_credits INT DEFAULT 825,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view billing config from their organizations
CREATE POLICY "Users can view organization billing config"
  ON public.billing_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = billing_config.organization_id
        AND user_id = auth.uid()
    )
  );

-- RLS: Org admins can manage billing config
CREATE POLICY "Org admins can manage billing config"
  ON public.billing_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE organization_id = billing_config.organization_id
        AND user_id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

-- Create indexes for performance
CREATE INDEX idx_clients_org_id ON public.clients(organization_id);
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_created_by ON public.clients(created_by);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_config_updated_at
  BEFORE UPDATE ON public.billing_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();