
-- 1. business_hour_schedules
CREATE TABLE public.business_hour_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Toronto',
  schedule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to_type text,
  assigned_to_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hour_schedules TO authenticated;
GRANT ALL ON public.business_hour_schedules TO service_role;
ALTER TABLE public.business_hour_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view schedules"
  ON public.business_hour_schedules FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "Org admins can manage schedules"
  ON public.business_hour_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_bhs_updated_at BEFORE UPDATE ON public.business_hour_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. holiday_schedules
CREATE TABLE public.holiday_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  greeting_text text,
  audio_url text,
  routing_action text NOT NULL DEFAULT 'voicemail',
  routing_target text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_schedules TO authenticated;
GRANT ALL ON public.holiday_schedules TO service_role;
ALTER TABLE public.holiday_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view holidays"
  ON public.holiday_schedules FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "Org admins can manage holidays"
  ON public.holiday_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_hs_updated_at BEFORE UPDATE ON public.holiday_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. telecom_admin_ai_actions
CREATE TABLE public.telecom_admin_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  interpreted_action text,
  proposed_changes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmation_status text NOT NULL DEFAULT 'pending',
  execution_status text NOT NULL DEFAULT 'pending',
  execution_result_json jsonb,
  source text NOT NULL DEFAULT 'desktop_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.telecom_admin_ai_actions TO authenticated;
GRANT ALL ON public.telecom_admin_ai_actions TO service_role;
ALTER TABLE public.telecom_admin_ai_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view AI actions"
  ON public.telecom_admin_ai_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Org admins insert AI actions"
  ON public.telecom_admin_ai_actions FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid() AND (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid())));
CREATE POLICY "Org admins update own AI actions"
  ON public.telecom_admin_ai_actions FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (admin_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- 4. org_chat_reads
CREATE TABLE public.org_chat_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.org_chat_channels(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_reads TO authenticated;
GRANT ALL ON public.org_chat_reads TO service_role;
ALTER TABLE public.org_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat reads"
  ON public.org_chat_reads FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_bhs_org ON public.business_hour_schedules(organization_id);
CREATE INDEX idx_hs_org_active ON public.holiday_schedules(organization_id, active);
CREATE INDEX idx_taa_org_created ON public.telecom_admin_ai_actions(organization_id, created_at DESC);
