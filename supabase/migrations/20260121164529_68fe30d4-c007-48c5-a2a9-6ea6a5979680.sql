-- Table for tracking active and completed Twilio calls with Realtime support
CREATE TABLE public.twilio_active_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  status TEXT NOT NULL DEFAULT 'initiated',
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration INTEGER,
  recording_url TEXT,
  recording_sid TEXT
);

-- Enable RLS
ALTER TABLE public.twilio_active_calls ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can view their org's calls
CREATE POLICY "Users can view organization calls"
ON public.twilio_active_calls FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE organization_members.organization_id = twilio_active_calls.organization_id
  AND organization_members.user_id = auth.uid()
));

-- Policy: System can insert/update calls (edge functions use service role)
CREATE POLICY "System can manage calls"
ON public.twilio_active_calls FOR ALL
USING (true)
WITH CHECK (true);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.twilio_active_calls;

-- Create index for faster lookups
CREATE INDEX idx_twilio_active_calls_org ON public.twilio_active_calls(organization_id);
CREATE INDEX idx_twilio_active_calls_status ON public.twilio_active_calls(status);
CREATE INDEX idx_twilio_active_calls_call_sid ON public.twilio_active_calls(call_sid);