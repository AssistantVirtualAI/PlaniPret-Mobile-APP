-- Add resolution_status to conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS resolution_status text DEFAULT 'pending';

-- Create webhook_endpoints table
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create webhook_delivery_logs table
CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  response_status integer,
  response_body text,
  attempt_count integer DEFAULT 1,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS for webhook_endpoints
CREATE POLICY "Users can view organization webhook endpoints"
ON public.webhook_endpoints FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = webhook_endpoints.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Org admins can manage webhook endpoints"
ON public.webhook_endpoints FOR ALL
USING (
  has_role(auth.uid(), organization_id, 'org_admin') OR 
  has_role(auth.uid(), organization_id, 'manager') OR 
  is_super_admin(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), organization_id, 'org_admin') OR 
  has_role(auth.uid(), organization_id, 'manager') OR 
  is_super_admin(auth.uid())
);

-- RLS for webhook_delivery_logs
CREATE POLICY "Users can view organization webhook logs"
ON public.webhook_delivery_logs FOR SELECT
USING (EXISTS (
  SELECT 1 FROM webhook_endpoints we
  JOIN organization_members om ON om.organization_id = we.organization_id
  WHERE we.id = webhook_delivery_logs.endpoint_id
  AND om.user_id = auth.uid()
));