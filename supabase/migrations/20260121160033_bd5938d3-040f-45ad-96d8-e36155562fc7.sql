-- Add twilio_number column to agents table for linking Twilio numbers to agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS twilio_number TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_twilio_number ON public.agents(twilio_number) WHERE twilio_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.agents.twilio_number IS 'Twilio phone number linked to this agent for call routing';