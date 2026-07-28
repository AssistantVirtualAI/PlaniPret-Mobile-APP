
-- Enum availability
DO $$ BEGIN
  CREATE TYPE public.user_availability AS ENUM ('available','busy','dnd','away','vacation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.after_hours_action AS ENUM ('voicemail','forward_extension','forward_external','follow_org_default');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.telecom_sync_status AS ENUM ('pending','synced','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table: user_working_hours
CREATE TABLE IF NOT EXISTS public.user_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working_day boolean NOT NULL DEFAULT true,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  break_start time,
  break_end time,
  timezone text NOT NULL DEFAULT 'America/Toronto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_working_hours TO authenticated;
GRANT ALL ON public.user_working_hours TO service_role;

ALTER TABLE public.user_working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uwh self read" ON public.user_working_hours
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "uwh self write" ON public.user_working_hours
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "uwh org admin read" ON public.user_working_hours
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "uwh org admin write" ON public.user_working_hours
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
                              WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_uwh_updated_at BEFORE UPDATE ON public.user_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: user_call_handling
CREATE TABLE IF NOT EXISTS public.user_call_handling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  availability public.user_availability NOT NULL DEFAULT 'available',
  after_hours_action public.after_hours_action NOT NULL DEFAULT 'voicemail',
  forward_target text,
  timezone text NOT NULL DEFAULT 'America/Toronto',
  sync_status public.telecom_sync_status NOT NULL DEFAULT 'pending',
  sync_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_call_handling TO authenticated;
GRANT ALL ON public.user_call_handling TO service_role;

ALTER TABLE public.user_call_handling ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uch self read" ON public.user_call_handling
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "uch self write" ON public.user_call_handling
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "uch org admin read" ON public.user_call_handling
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "uch org admin write" ON public.user_call_handling
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
                              WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_uch_updated_at BEFORE UPDATE ON public.user_call_handling
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
