
-- Call center columns on softphone users
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS cc_role text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cc_queues text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cc_status text DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS cc_pause_reason text,
  ADD COLUMN IF NOT EXISTS cc_calls_today integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc_avg_handle_time integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc_logged_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS cc_skills text[] DEFAULT '{}';

-- Queue stats (real-time)
CREATE TABLE IF NOT EXISTS public.cc_queue_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  queue_name text NOT NULL,
  queue_extension text,
  calls_waiting integer DEFAULT 0,
  calls_answered_today integer DEFAULT 0,
  calls_abandoned_today integer DEFAULT 0,
  avg_wait_time_seconds integer DEFAULT 0,
  avg_handle_time_seconds integer DEFAULT 0,
  service_level_percent integer DEFAULT 0,
  agents_total integer DEFAULT 0,
  agents_available integer DEFAULT 0,
  agents_on_call integer DEFAULT 0,
  agents_paused integer DEFAULT 0,
  agents_offline integer DEFAULT 0,
  longest_wait_seconds integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_queue_stats TO authenticated;
GRANT ALL ON public.cc_queue_stats TO service_role;
ALTER TABLE public.cc_queue_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_cc_queue_stats_read" ON public.cc_queue_stats
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org_cc_queue_stats_write" ON public.cc_queue_stats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Agent activity log
CREATE TABLE IF NOT EXISTS public.cc_agent_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  agent_id uuid,
  agent_extension text,
  agent_name text,
  activity_type text,
  queue_name text,
  pause_reason text,
  call_id text,
  caller_number text,
  duration_seconds integer,
  notes text,
  disposition text,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_agent_activity TO authenticated;
GRANT ALL ON public.cc_agent_activity TO service_role;
ALTER TABLE public.cc_agent_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_cc_agent_activity_read" ON public.cc_agent_activity
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org_cc_agent_activity_insert" ON public.cc_agent_activity
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));

-- Supervisor monitor sessions
CREATE TABLE IF NOT EXISTS public.cc_monitor_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  supervisor_id uuid,
  supervisor_extension text,
  agent_extension text,
  call_id text,
  monitor_type text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_monitor_sessions TO authenticated;
GRANT ALL ON public.cc_monitor_sessions TO service_role;
ALTER TABLE public.cc_monitor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_cc_monitor_sessions_all" ON public.cc_monitor_sessions
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));

-- Pause reasons
CREATE TABLE IF NOT EXISTS public.cc_pause_reasons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  reason text NOT NULL,
  is_productive boolean DEFAULT false,
  color text DEFAULT '#666666',
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_pause_reasons TO authenticated;
GRANT ALL ON public.cc_pause_reasons TO service_role;
ALTER TABLE public.cc_pause_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_cc_pause_reasons_read" ON public.cc_pause_reasons
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY "org_cc_pause_reasons_write" ON public.cc_pause_reasons
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));

-- Report schedules
CREATE TABLE IF NOT EXISTS public.cc_report_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  report_type text NOT NULL,
  cadence text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  enabled boolean DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cc_report_schedules TO authenticated;
GRANT ALL ON public.cc_report_schedules TO service_role;
ALTER TABLE public.cc_report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_cc_report_schedules_all" ON public.cc_report_schedules
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.current_user_org_ids()));

-- Supervisor helper
CREATE OR REPLACE FUNCTION public.is_cc_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pbx_softphone_users
    WHERE portal_user_id = _user_id
      AND cc_role IN ('supervisor', 'admin')
  )
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_queue_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cc_agent_activity;
