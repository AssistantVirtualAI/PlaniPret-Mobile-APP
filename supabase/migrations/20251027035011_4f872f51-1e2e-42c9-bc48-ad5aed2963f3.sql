-- Create organization_integrations table
CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('elevenlabs', 'vapi', 'retell')),
  api_key TEXT NOT NULL,
  agent_id TEXT,
  additional_config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Enable RLS
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own integrations"
  ON public.organization_integrations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_org_integrations_user_platform 
  ON public.organization_integrations(user_id, platform, is_active);

-- Update conversations table with new columns
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS user_messages JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS agent_messages JSONB DEFAULT '[]'::jsonb;

-- Index for external_id lookup
CREATE INDEX IF NOT EXISTS idx_conversations_external_id ON public.conversations(external_id);

-- Trigger for updated_at on organization_integrations
CREATE TRIGGER update_organization_integrations_updated_at
  BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();