
-- 1) Drop blanket lemtel_staff_select policies on tenant-scoped PBX tables
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_call_queues;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_call_recordings;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_call_records;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_call_transcripts;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_conferences;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_destinations;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_devices;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_dialplans;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_domain_users;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_extensions;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_gateways;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_hold_music;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_ivrs;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_queue_agents;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_ring_groups;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_softphone_users;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_sync_jobs;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_time_conditions;
DROP POLICY IF EXISTS "lemtel_staff_select" ON public.pbx_voicemails;

-- 2) Remove is_lemtel_admin cross-org grants on shared admin tables
DROP POLICY IF EXISTS "Org admins can delete clients" ON public.clients;
CREATE POLICY "Org admins can delete clients" ON public.clients FOR DELETE
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "Org admins can insert clients" ON public.clients;
CREATE POLICY "Org admins can insert clients" ON public.clients FOR INSERT
WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "Org admins can update clients" ON public.clients;
CREATE POLICY "Org admins can update clients" ON public.clients FOR UPDATE
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "admin_actions_select" ON public.pbx_admin_actions;
CREATE POLICY "admin_actions_select" ON public.pbx_admin_actions FOR SELECT
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "admin_actions_insert" ON public.pbx_admin_actions;
CREATE POLICY "admin_actions_insert" ON public.pbx_admin_actions FOR INSERT
WITH CHECK (actor_user_id = auth.uid() AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)));

DROP POLICY IF EXISTS "Org admins view pbx_admin_users" ON public.pbx_admin_users;
CREATE POLICY "Org admins view pbx_admin_users" ON public.pbx_admin_users FOR SELECT
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "lemtel admins manage domains" ON public.pbx_domains;
CREATE POLICY "Org admins manage domains" ON public.pbx_domains FOR ALL
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "Lemtel admins can view provision queue" ON public.pbx_app_provision_queue;
CREATE POLICY "Super admins view provision queue" ON public.pbx_app_provision_queue FOR SELECT
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));
