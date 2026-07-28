
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS lead_score int CHECK (lead_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS lead_temperature text CHECK (lead_temperature IN ('hot','warm','cold')),
  ADD COLUMN IF NOT EXISTS lead_score_reason text,
  ADD COLUMN IF NOT EXISTS suggested_callback_delay text,
  ADD COLUMN IF NOT EXISTS callback_reason text;

CREATE INDEX IF NOT EXISTS idx_planipret_phone_calls_lead_temp
  ON public.planipret_phone_calls(lead_temperature, started_at DESC);

ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS dnd_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_start_time time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS dnd_end_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS dnd_auto_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnd_message_fr text NOT NULL DEFAULT 'Bonjour, je suis actuellement indisponible. Veuillez laisser un message et je vous rappellerai dans les plus brefs délais.';

CREATE TABLE IF NOT EXISTS public.planipret_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.planipret_phone_calls(id) ON DELETE SET NULL,
  contact_number text,
  contact_name text,
  reminder_type text NOT NULL DEFAULT 'callback' CHECK (reminder_type IN ('callback','followup','meeting_prep')),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed','done')),
  ai_suggested boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_reminders TO authenticated;
GRANT ALL ON public.planipret_reminders TO service_role;
ALTER TABLE public.planipret_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_reminders_self" ON public.planipret_reminders
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_planipret_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_planipret_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_planipret_reminders_user_status
  ON public.planipret_reminders(user_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.planipret_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_number text,
  maestro_contact_id text,
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','analyzing','submitted','approved','closed')),
  value_estimate numeric,
  notes text,
  last_call_id uuid REFERENCES public.planipret_phone_calls(id) ON DELETE SET NULL,
  next_reminder_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_pipeline TO authenticated;
GRANT ALL ON public.planipret_pipeline TO service_role;
ALTER TABLE public.planipret_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_pipeline_self" ON public.planipret_pipeline
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_planipret_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_planipret_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_planipret_pipeline_user_stage
  ON public.planipret_pipeline(user_id, stage);

CREATE TRIGGER trg_planipret_reminders_updated
  BEFORE UPDATE ON public.planipret_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_planipret_pipeline_updated
  BEFORE UPDATE ON public.planipret_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
