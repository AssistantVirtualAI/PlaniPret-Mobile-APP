-- Table pour les numéros de téléphone
CREATE TABLE public.phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  phone_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio',
  provider_sid TEXT,
  friendly_name TEXT,
  capabilities JSONB DEFAULT '{"voice": true, "sms": false}'::jsonb,
  status TEXT DEFAULT 'active',
  monthly_cost NUMERIC DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for phone_numbers
CREATE POLICY "Users can view organization phone numbers"
ON public.phone_numbers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = phone_numbers.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Managers can manage phone numbers"
ON public.phone_numbers FOR ALL
USING (
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  is_super_admin(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), organization_id, 'manager'::app_role) OR
  has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR
  is_super_admin(auth.uid())
);

-- Table pour les demandes de handoff
CREATE TABLE public.handoff_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  agent_id UUID REFERENCES public.agents(id),
  human_agent_id UUID,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  customer_info JSONB DEFAULT '{}'::jsonb,
  transcript_snapshot TEXT,
  chat_messages JSONB DEFAULT '[]'::jsonb,
  requested_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.handoff_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for handoff_requests
CREATE POLICY "Users can view organization handoff requests"
ON public.handoff_requests FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = handoff_requests.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Agents can manage handoff requests"
ON public.handoff_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = handoff_requests.organization_id
    AND organization_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = handoff_requests.organization_id
    AND organization_members.user_id = auth.uid()
  )
);

-- Enable realtime for handoff_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.handoff_requests;

-- Index for performance
CREATE INDEX idx_phone_numbers_org ON public.phone_numbers(organization_id);
CREATE INDEX idx_handoff_requests_org ON public.handoff_requests(organization_id);
CREATE INDEX idx_handoff_requests_status ON public.handoff_requests(status);