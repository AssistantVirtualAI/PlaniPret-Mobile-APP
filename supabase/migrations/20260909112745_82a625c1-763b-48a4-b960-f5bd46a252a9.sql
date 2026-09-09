ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS save_consent text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS save_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS save_consent_by uuid,
  ADD COLUMN IF NOT EXISTS save_consent_channel text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS maestro_purged_at timestamptz,
  ADD COLUMN IF NOT EXISTS maestro_purge_error text;

ALTER TABLE public.planipret_phone_calls
  DROP CONSTRAINT IF EXISTS planipret_phone_calls_save_consent_check;
ALTER TABLE public.planipret_phone_calls
  ADD CONSTRAINT planipret_phone_calls_save_consent_check
  CHECK (save_consent IN ('pending','approved','declined'));

CREATE INDEX IF NOT EXISTS idx_pp_calls_save_consent
  ON public.planipret_phone_calls (save_consent, created_at DESC);

CREATE TABLE IF NOT EXISTS public.planipret_call_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.planipret_phone_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sms','email')),
  recipient text NOT NULL,
  recipient_name text,
  maestro_client_id text,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','declined','sent','failed')),
  approved_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_call_followups TO authenticated;
GRANT ALL ON public.planipret_call_followups TO service_role;

ALTER TABLE public.planipret_call_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage their own call followups"
ON public.planipret_call_followups
FOR ALL
TO authenticated
USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));

CREATE TRIGGER planipret_call_followups_updated_at
BEFORE UPDATE ON public.planipret_call_followups
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();