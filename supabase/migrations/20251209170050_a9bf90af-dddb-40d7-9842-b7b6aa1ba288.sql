-- Create SMS templates table
CREATE TABLE public.sms_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR DEFAULT 'general',
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view organization SMS templates"
ON public.sms_templates FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = sms_templates.organization_id
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Managers can manage SMS templates"
ON public.sms_templates FOR ALL
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

-- Create index
CREATE INDEX idx_sms_templates_org ON public.sms_templates(organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_sms_templates_updated_at
BEFORE UPDATE ON public.sms_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();