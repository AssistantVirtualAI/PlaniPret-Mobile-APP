
CREATE TABLE IF NOT EXISTS public.telecom_live_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sip_call_id text,
  channel_uuid text,
  direction text,
  caller_number text,
  caller_name text,
  destination_number text,
  extension text,
  queue text,
  state text,
  answered_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel_uuid)
);
CREATE INDEX IF NOT EXISTS idx_telecom_live_calls_org ON public.telecom_live_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_telecom_live_calls_state ON public.telecom_live_calls(state);
GRANT SELECT ON public.telecom_live_calls TO authenticated;
GRANT ALL ON public.telecom_live_calls TO service_role;
ALTER TABLE public.telecom_live_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read live calls" ON public.telecom_live_calls
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())) OR public.is_super_admin(auth.uid()));
CREATE TRIGGER set_updated_at_telecom_live_calls
  BEFORE UPDATE ON public.telecom_live_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.telecom_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  target text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_in integer DEFAULT 0,
  rows_out integer DEFAULT 0,
  retries integer DEFAULT 0,
  error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telecom_sync_jobs_org_started ON public.telecom_sync_jobs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_telecom_sync_jobs_source ON public.telecom_sync_jobs(source, started_at DESC);
GRANT SELECT ON public.telecom_sync_jobs TO authenticated;
GRANT ALL ON public.telecom_sync_jobs TO service_role;
ALTER TABLE public.telecom_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read sync jobs" ON public.telecom_sync_jobs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (organization_id IS NOT NULL AND public.has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  );

CREATE TABLE IF NOT EXISTS public.telecom_sync_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  consecutive_failures integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source)
);
GRANT SELECT ON public.telecom_sync_health TO authenticated;
GRANT ALL ON public.telecom_sync_health TO service_role;
ALTER TABLE public.telecom_sync_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read sync health" ON public.telecom_sync_health
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (organization_id IS NOT NULL AND public.has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  );
CREATE TRIGGER set_updated_at_telecom_sync_health
  BEFORE UPDATE ON public.telecom_sync_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.telecom_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telecom_audit_org_created ON public.telecom_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telecom_audit_actor ON public.telecom_audit_logs(actor_user_id);
GRANT SELECT ON public.telecom_audit_logs TO authenticated;
GRANT ALL ON public.telecom_audit_logs TO service_role;
ALTER TABLE public.telecom_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins read audit" ON public.telecom_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  );

CREATE OR REPLACE VIEW public.telecom_extensions_v
WITH (security_invoker = on) AS
SELECT
  e.id, e.organization_id, e.client_id, e.pbx_uuid, e.extension,
  e.effective_cid_name, e.effective_cid_number,
  e.outbound_cid_name, e.outbound_cid_number,
  e.directory_first_name, e.directory_last_name, e.directory_visible,
  e.call_group, e.voicemail_enabled, e.call_recording, e.do_not_disturb,
  e.forward_all_enabled, e.forward_all_destination,
  e.forward_busy_enabled, e.forward_no_answer_enabled,
  e.enabled, e.description, e.extension_language, e.extension_type,
  e.call_timeout, e.portal_user_id, e.synced_at, e.created_at, e.updated_at,
  s.display_name AS softphone_display_name,
  s.status AS softphone_status,
  s.last_seen_at AS softphone_last_seen_at
FROM public.pbx_extensions e
LEFT JOIN public.pbx_softphone_users s ON s.extension_id = e.id;
GRANT SELECT ON public.telecom_extensions_v TO authenticated;

CREATE OR REPLACE VIEW public.telecom_cdr_v
WITH (security_invoker = on) AS
SELECT
  id, organization_id, client_id, pbx_uuid, direction, call_status, extension,
  caller_name, caller_number, destination, source_number, destination_number,
  start_at, answer_at, end_at, duration_seconds, billsec, waitsec,
  missed_call, has_recording, transcribed, analyzed, ai_processing,
  hangup_cause, sip_call_id, ivr_menu_uuid, ring_group_uuid,
  notes, tags, crm_synced, created_at
FROM public.pbx_call_records;
GRANT SELECT ON public.telecom_cdr_v TO authenticated;

CREATE OR REPLACE VIEW public.telecom_voicemails_v
WITH (security_invoker = on) AS
SELECT
  id, organization_id, extension, mailbox, caller_number, caller_name,
  received_at, duration_seconds,
  (audio_storage_path IS NOT NULL) AS has_audio,
  transcript, ai_summary, ai_tags, folder, read_at, deleted_at,
  fusionpbx_uuid, created_at
FROM public.pbx_voicemails
WHERE deleted_at IS NULL;
GRANT SELECT ON public.telecom_voicemails_v TO authenticated;

CREATE OR REPLACE VIEW public.telecom_recordings_v
WITH (security_invoker = on) AS
SELECT
  id, organization_id, client_id, call_record_id, pbx_uuid,
  duration_seconds, direction, recorded_at, transcription_status,
  (storage_path IS NOT NULL OR file_url IS NOT NULL) AS has_audio,
  created_at
FROM public.pbx_call_recordings;
GRANT SELECT ON public.telecom_recordings_v TO authenticated;

CREATE OR REPLACE VIEW public.telecom_queues_v
WITH (security_invoker = on) AS
SELECT
  q.id, q.organization_id, q.client_id, q.pbx_uuid,
  q.name, q.extension, q.strategy, q.music_on_hold, q.record_enabled,
  q.max_wait_time, q.timeout_action, q.enabled, q.description,
  q.created_at, q.updated_at,
  (SELECT count(*) FROM public.pbx_queue_agents a WHERE a.queue_id = q.id) AS agent_count,
  (SELECT count(*) FROM public.pbx_queue_agent_state s WHERE s.queue_id = q.id::text AND s.paused = false) AS available_agents
FROM public.pbx_call_queues q;
GRANT SELECT ON public.telecom_queues_v TO authenticated;

CREATE OR REPLACE VIEW public.telecom_routing_v
WITH (security_invoker = on) AS
SELECT
  f.user_id, f.organization_id,
  f.always_enabled, f.always_to,
  f.busy_enabled, f.busy_to,
  f.no_answer_enabled, f.no_answer_to, f.no_answer_seconds,
  f.offline_enabled, f.offline_to,
  f.dnd_enabled, f.dnd_schedule,
  f.updated_at
FROM public.pbx_call_forwarding f;
GRANT SELECT ON public.telecom_routing_v TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.telecom_live_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telecom_sync_jobs;
