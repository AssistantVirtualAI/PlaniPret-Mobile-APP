ALTER TABLE public.pbx_voicemail_greetings
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.pbx_voicemail_greeting_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  greeting_id uuid NOT NULL REFERENCES public.pbx_voicemail_greetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  request_id text,
  http_status integer,
  error_message text,
  error_payload jsonb,
  voice_id text,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_voicemail_greeting_attempts TO authenticated;
GRANT ALL ON public.pbx_voicemail_greeting_attempts TO service_role;

ALTER TABLE public.pbx_voicemail_greeting_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own greeting attempts"
ON public.pbx_voicemail_greeting_attempts
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_greeting_attempts_greeting ON public.pbx_voicemail_greeting_attempts(greeting_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_greetings_user_status ON public.pbx_voicemail_greetings(user_id, status);