-- Add smart_tags column to conversations for auto-categorization
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS smart_tags TEXT[] DEFAULT '{}';

-- Add alert_sent flag to agent_insights to track if alert was sent
ALTER TABLE public.agent_insights ADD COLUMN IF NOT EXISTS alert_sent BOOLEAN DEFAULT false;
ALTER TABLE public.agent_insights ADD COLUMN IF NOT EXISTS smart_tags TEXT[] DEFAULT '{}';

-- Create index for smart tags search
CREATE INDEX IF NOT EXISTS idx_conversations_smart_tags ON public.conversations USING GIN(smart_tags);

-- Create agent_health_scores table for tracking agent performance over time
CREATE TABLE IF NOT EXISTS public.agent_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Health score components
  satisfaction_score NUMERIC(4,2) DEFAULT 0,
  sentiment_score NUMERIC(4,2) DEFAULT 0,
  resolution_rate NUMERIC(4,2) DEFAULT 0,
  overall_health_score NUMERIC(4,2) DEFAULT 0,
  
  -- Metrics
  total_conversations INTEGER DEFAULT 0,
  positive_sentiments INTEGER DEFAULT 0,
  negative_sentiments INTEGER DEFAULT 0,
  resolved_conversations INTEGER DEFAULT 0,
  
  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_health_scores_agent ON public.agent_health_scores(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_scores_period ON public.agent_health_scores(period_start, period_end);

-- Enable RLS
ALTER TABLE public.agent_health_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view organization health scores"
  ON public.agent_health_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_health_scores.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage health scores"
  ON public.agent_health_scores
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create alert_notifications table for tracking sent alerts
CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  
  alert_type TEXT NOT NULL,
  satisfaction_score NUMERIC(3,1),
  email_sent_to TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_alert_notifications_org ON public.alert_notifications(organization_id);

-- Enable RLS
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view organization alerts"
  ON public.alert_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = alert_notifications.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage alerts"
  ON public.alert_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);