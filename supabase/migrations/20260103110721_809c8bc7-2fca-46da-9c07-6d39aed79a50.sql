-- Create agent_insights table for storing AI analysis and improvement recommendations
CREATE TABLE public.agent_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Satisfaction and sentiment analysis
  satisfaction_score NUMERIC(3,1) CHECK (satisfaction_score >= 1.0 AND satisfaction_score <= 10.0),
  sentiment_timeline JSONB DEFAULT '[]'::jsonb,
  overall_sentiment TEXT,
  
  -- Improvement recommendations
  improvements JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_agent_insights_agent ON public.agent_insights(agent_id);
CREATE INDEX idx_agent_insights_org ON public.agent_insights(organization_id);
CREATE INDEX idx_agent_insights_conversation ON public.agent_insights(conversation_id);

-- Enable RLS
ALTER TABLE public.agent_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view organization insights"
  ON public.agent_insights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_insights.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert organization insights"
  ON public.agent_insights
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = agent_insights.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage insights"
  ON public.agent_insights
  FOR ALL
  USING (true)
  WITH CHECK (true);