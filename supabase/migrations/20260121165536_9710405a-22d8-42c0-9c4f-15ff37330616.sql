-- Add recording_enabled column to track recording preference per phone number
ALTER TABLE public.phone_numbers 
ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT false;

-- Add index for faster analytics queries on twilio_active_calls
CREATE INDEX IF NOT EXISTS idx_twilio_active_calls_started_at ON public.twilio_active_calls(started_at);
CREATE INDEX IF NOT EXISTS idx_twilio_active_calls_agent ON public.twilio_active_calls(agent_id);