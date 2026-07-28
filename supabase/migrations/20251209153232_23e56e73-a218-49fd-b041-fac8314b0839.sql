-- Create calendar integrations table
CREATE TABLE public.calendar_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google', -- google, outlook, ghl
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  calendar_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, provider)
);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  calendar_integration_id UUID REFERENCES public.calendar_integrations(id) ON DELETE SET NULL,
  external_event_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  attendee_name TEXT,
  attendee_email TEXT,
  attendee_phone TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, cancelled, completed
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Calendar integrations policies
CREATE POLICY "Org admins can manage calendar integrations"
ON public.calendar_integrations
FOR ALL
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

CREATE POLICY "Users can view organization calendar integrations"
ON public.calendar_integrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = calendar_integrations.organization_id
    AND organization_members.user_id = auth.uid()
  )
);

-- Appointments policies
CREATE POLICY "Users can manage organization appointments"
ON public.appointments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = appointments.organization_id
    AND organization_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = appointments.organization_id
    AND organization_members.user_id = auth.uid()
  )
);

-- Create indexes
CREATE INDEX idx_appointments_organization ON public.appointments(organization_id);
CREATE INDEX idx_appointments_agent ON public.appointments(agent_id);
CREATE INDEX idx_appointments_start_time ON public.appointments(start_time);
CREATE INDEX idx_calendar_integrations_org ON public.calendar_integrations(organization_id);