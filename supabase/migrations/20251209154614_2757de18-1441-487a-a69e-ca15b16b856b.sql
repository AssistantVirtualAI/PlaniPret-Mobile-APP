-- Create leads table for tracking qualified leads
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'contacted', 'converted', 'lost')),
  score INTEGER DEFAULT 0,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  qualified_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create performance_metrics table for monthly tracking
CREATE TABLE public.performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  appointments_booked INTEGER DEFAULT 0,
  appointments_completed INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  leads_converted INTEGER DEFAULT 0,
  conversations_count INTEGER DEFAULT 0,
  total_duration_minutes INTEGER DEFAULT 0,
  billable_amount NUMERIC(10,2) DEFAULT 0,
  billed_at TIMESTAMP WITH TIME ZONE,
  stripe_invoice_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, period_start)
);

-- Add performance billing config to billing_config
ALTER TABLE public.billing_config 
ADD COLUMN IF NOT EXISTS performance_billing_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS price_per_appointment NUMERIC(10,2) DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS price_per_qualified_lead NUMERIC(10,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS price_per_converted_lead NUMERIC(10,2) DEFAULT 25.00;

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for leads
CREATE POLICY "Users can view organization leads"
ON public.leads FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = leads.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Users can create organization leads"
ON public.leads FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = leads.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Managers can update organization leads"
ON public.leads FOR UPDATE
USING (
  has_role(auth.uid(), organization_id, 'manager') OR
  has_role(auth.uid(), organization_id, 'org_admin') OR
  is_super_admin(auth.uid())
);

CREATE POLICY "Managers can delete organization leads"
ON public.leads FOR DELETE
USING (
  has_role(auth.uid(), organization_id, 'manager') OR
  has_role(auth.uid(), organization_id, 'org_admin') OR
  is_super_admin(auth.uid())
);

-- RLS policies for performance_metrics
CREATE POLICY "Users can view organization metrics"
ON public.performance_metrics FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = performance_metrics.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "System can manage performance metrics"
ON public.performance_metrics FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at);
CREATE INDEX idx_performance_metrics_org_period ON public.performance_metrics(organization_id, period_start);

-- Trigger for updated_at
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_metrics_updated_at
BEFORE UPDATE ON public.performance_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();