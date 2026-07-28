-- Create outbound_campaigns table
CREATE TABLE public.outbound_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  phone_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  total_calls INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign_calls table for individual call tracking
CREATE TABLE public.campaign_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.outbound_campaigns(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'no_answer')),
  duration INTEGER,
  outcome TEXT,
  transcript TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  called_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create conversation_topics table for NLP analysis
CREATE TABLE public.conversation_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  category TEXT,
  confidence NUMERIC(3,2) DEFAULT 1.0,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  frequency INTEGER DEFAULT 1,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create aggregated topics view for quick lookups
CREATE TABLE public.topic_aggregates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  category TEXT,
  total_mentions INTEGER DEFAULT 1,
  avg_sentiment NUMERIC(3,2),
  last_mentioned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, topic)
);

-- Enable RLS
ALTER TABLE public.outbound_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_aggregates ENABLE ROW LEVEL SECURITY;

-- Outbound campaigns policies
CREATE POLICY "Users can view organization campaigns" 
ON public.outbound_campaigns 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM organization_members 
  WHERE organization_members.organization_id = outbound_campaigns.organization_id 
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "Managers can manage campaigns" 
ON public.outbound_campaigns 
FOR ALL 
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

-- Campaign calls policies
CREATE POLICY "Users can view campaign calls" 
ON public.campaign_calls 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM outbound_campaigns oc
  JOIN organization_members om ON om.organization_id = oc.organization_id
  WHERE oc.id = campaign_calls.campaign_id AND om.user_id = auth.uid()
));

CREATE POLICY "Managers can manage campaign calls" 
ON public.campaign_calls 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM outbound_campaigns oc
  WHERE oc.id = campaign_calls.campaign_id AND (
    has_role(auth.uid(), oc.organization_id, 'manager'::app_role) OR 
    has_role(auth.uid(), oc.organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM outbound_campaigns oc
  WHERE oc.id = campaign_calls.campaign_id AND (
    has_role(auth.uid(), oc.organization_id, 'manager'::app_role) OR 
    has_role(auth.uid(), oc.organization_id, 'org_admin'::app_role) OR 
    is_super_admin(auth.uid())
  )
));

-- Conversation topics policies
CREATE POLICY "Users can view organization topics" 
ON public.conversation_topics 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM organization_members 
  WHERE organization_members.organization_id = conversation_topics.organization_id 
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "System can insert topics" 
ON public.conversation_topics 
FOR INSERT 
WITH CHECK (true);

-- Topic aggregates policies
CREATE POLICY "Users can view organization topic aggregates" 
ON public.topic_aggregates 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM organization_members 
  WHERE organization_members.organization_id = topic_aggregates.organization_id 
  AND organization_members.user_id = auth.uid()
));

CREATE POLICY "System can manage topic aggregates" 
ON public.topic_aggregates 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_outbound_campaigns_org ON public.outbound_campaigns(organization_id);
CREATE INDEX idx_outbound_campaigns_status ON public.outbound_campaigns(status);
CREATE INDEX idx_campaign_calls_campaign ON public.campaign_calls(campaign_id);
CREATE INDEX idx_conversation_topics_org ON public.conversation_topics(organization_id);
CREATE INDEX idx_conversation_topics_topic ON public.conversation_topics(topic);
CREATE INDEX idx_topic_aggregates_org ON public.topic_aggregates(organization_id);
CREATE INDEX idx_topic_aggregates_mentions ON public.topic_aggregates(total_mentions DESC);

-- Trigger for updated_at
CREATE TRIGGER update_outbound_campaigns_updated_at
BEFORE UPDATE ON public.outbound_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_topic_aggregates_updated_at
BEFORE UPDATE ON public.topic_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();