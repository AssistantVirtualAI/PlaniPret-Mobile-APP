-- Calendar sync mapping
CREATE TABLE IF NOT EXISTS public.planipret_calendar_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  maestro_event_id text,
  m365_event_id text,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  sync_direction text NOT NULL DEFAULT 'both' CHECK (sync_direction IN ('maestro_to_m365','m365_to_maestro','both')),
  status text NOT NULL DEFAULT 'synced' CHECK (status IN ('synced','conflict','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcs_user ON public.planipret_calendar_sync(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcs_m365 ON public.planipret_calendar_sync(user_id, m365_event_id) WHERE m365_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcs_maestro ON public.planipret_calendar_sync(user_id, maestro_event_id) WHERE maestro_event_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_calendar_sync TO authenticated;
GRANT ALL ON public.planipret_calendar_sync TO service_role;

ALTER TABLE public.planipret_calendar_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers manage own calendar sync"
  ON public.planipret_calendar_sync FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()));

CREATE TRIGGER pcs_updated_at BEFORE UPDATE ON public.planipret_calendar_sync
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile extensions
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS notif_hot_leads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_appointment_reminder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_missed_call boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_morning_brief boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_eod_summary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_morning_brief_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_eod_summary_at timestamptz;