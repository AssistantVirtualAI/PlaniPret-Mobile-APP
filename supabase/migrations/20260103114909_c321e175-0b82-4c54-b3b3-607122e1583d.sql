-- Create table for AI daily reports per agent
CREATE TABLE public.agent_daily_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metrics summary
  total_conversations INTEGER DEFAULT 0,
  avg_satisfaction NUMERIC(3,2),
  avg_duration_seconds INTEGER,
  success_rate NUMERIC(5,2),
  
  -- AI Analysis
  summary TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  prompt_suggestions TEXT[],
  kb_suggestions TEXT[],
  priority_actions JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  conversations_analyzed INTEGER DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint per agent per day
  UNIQUE(agent_id, report_date)
);

-- Enable RLS
ALTER TABLE public.agent_daily_reports ENABLE ROW LEVEL SECURITY;

-- Users can view their organization's reports
CREATE POLICY "Users can view organization agent reports"
ON public.agent_daily_reports
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = agent_daily_reports.organization_id
    AND organization_members.user_id = auth.uid()
  )
);

-- System can manage reports (for edge functions)
CREATE POLICY "System can manage agent reports"
ON public.agent_daily_reports
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_agent_daily_reports_updated_at
BEFORE UPDATE ON public.agent_daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_agent_daily_reports_agent_date ON public.agent_daily_reports(agent_id, report_date DESC);
CREATE INDEX idx_agent_daily_reports_org_date ON public.agent_daily_reports(organization_id, report_date DESC);