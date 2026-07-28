
-- =====================================================================
-- 1) Switch sensitive-table RLS to get_user_organization_ids()
--    Prevents softphone-only users (extension-only access via
--    pbx_softphone_users) from gaining org-wide visibility on
--    sensitive tables. Keeps current_user_org_ids() ONLY on tables
--    that are intentionally per-extension (voicemails, queue state,
--    user_presence) or per-user (pbx_ai_*).
-- =====================================================================

-- appointment_reminders
DROP POLICY IF EXISTS "appt_reminders_org_select" ON public.appointment_reminders;
CREATE POLICY "appt_reminders_org_select" ON public.appointment_reminders
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- business_hour_schedules
DROP POLICY IF EXISTS "Org members can view schedules" ON public.business_hour_schedules;
CREATE POLICY "Org members can view schedules" ON public.business_hour_schedules
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- holiday_schedules
DROP POLICY IF EXISTS "Org members can view holidays" ON public.holiday_schedules;
CREATE POLICY "Org members can view holidays" ON public.holiday_schedules
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- cc_agent_activity
DROP POLICY IF EXISTS "org_cc_agent_activity_insert" ON public.cc_agent_activity;
CREATE POLICY "org_cc_agent_activity_insert" ON public.cc_agent_activity
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_cc_supervisor(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.pbx_softphone_users spu
        WHERE spu.portal_user_id = auth.uid()
          AND spu.organization_id = cc_agent_activity.organization_id
          AND spu.cc_role = ANY (ARRAY['agent'::text,'supervisor'::text,'admin'::text])
      )
    )
  );

DROP POLICY IF EXISTS "org_cc_agent_activity_read" ON public.cc_agent_activity;
CREATE POLICY "org_cc_agent_activity_read" ON public.cc_agent_activity
  FOR SELECT USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_cc_supervisor(auth.uid())
    )
  );

-- cc_monitor_sessions
DROP POLICY IF EXISTS "cc_monitor_sessions_read_privileged" ON public.cc_monitor_sessions;
CREATE POLICY "cc_monitor_sessions_read_privileged" ON public.cc_monitor_sessions
  FOR SELECT USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cc_monitor_sessions_write" ON public.cc_monitor_sessions;
CREATE POLICY "cc_monitor_sessions_write" ON public.cc_monitor_sessions
  FOR ALL USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "org_cc_monitor_sessions_write" ON public.cc_monitor_sessions;
CREATE POLICY "org_cc_monitor_sessions_write" ON public.cc_monitor_sessions
  FOR ALL USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- cc_pause_reasons
DROP POLICY IF EXISTS "cc_pause_reasons_write" ON public.cc_pause_reasons;
CREATE POLICY "cc_pause_reasons_write" ON public.cc_pause_reasons
  FOR ALL USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "org_cc_pause_reasons_read" ON public.cc_pause_reasons;
CREATE POLICY "org_cc_pause_reasons_read" ON public.cc_pause_reasons
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "org_cc_pause_reasons_write" ON public.cc_pause_reasons;
CREATE POLICY "org_cc_pause_reasons_write" ON public.cc_pause_reasons
  FOR ALL USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- cc_report_schedules
DROP POLICY IF EXISTS "cc_report_schedules_select_privileged" ON public.cc_report_schedules;
CREATE POLICY "cc_report_schedules_select_privileged" ON public.cc_report_schedules
  FOR SELECT USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "cc_report_schedules_write" ON public.cc_report_schedules;
CREATE POLICY "cc_report_schedules_write" ON public.cc_report_schedules
  FOR ALL USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_cc_supervisor(auth.uid())
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    )
  );

-- org_contacts (sensitive CRM data)
DROP POLICY IF EXISTS "org members delete org contacts" ON public.org_contacts;
CREATE POLICY "org members delete org contacts" ON public.org_contacts
  FOR DELETE USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "org members insert org contacts" ON public.org_contacts;
CREATE POLICY "org members insert org contacts" ON public.org_contacts
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "org members read org contacts" ON public.org_contacts;
CREATE POLICY "org members read org contacts" ON public.org_contacts
  FOR SELECT USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "org members update org contacts" ON public.org_contacts;
CREATE POLICY "org members update org contacts" ON public.org_contacts
  FOR UPDATE USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- pbx_sync_jobs
DROP POLICY IF EXISTS "Org members can view sync jobs" ON public.pbx_sync_jobs;
CREATE POLICY "Org members can view sync jobs" ON public.pbx_sync_jobs
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- telecom_sync_health
DROP POLICY IF EXISTS "members can record sync health" ON public.telecom_sync_health;
CREATE POLICY "members can record sync health" ON public.telecom_sync_health
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- voice_agent_assignments
DROP POLICY IF EXISTS "members read voice_agent_assignments" ON public.voice_agent_assignments;
CREATE POLICY "members read voice_agent_assignments" ON public.voice_agent_assignments
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "members write voice_agent_assignments" ON public.voice_agent_assignments;
CREATE POLICY "members write voice_agent_assignments" ON public.voice_agent_assignments
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- voice_agent_clients
DROP POLICY IF EXISTS "members read voice_agent_clients" ON public.voice_agent_clients;
CREATE POLICY "members read voice_agent_clients" ON public.voice_agent_clients
  FOR SELECT USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "members write voice_agent_clients" ON public.voice_agent_clients;
CREATE POLICY "members write voice_agent_clients" ON public.voice_agent_clients
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- =====================================================================
-- 2) Direct messages on org_chat_messages
--    channel_id is nullable; existing policies use can_access_chat_channel()
--    which returns false for NULL channel_id, so DMs were unreadable.
--    Add explicit SELECT/INSERT policies for DM rows, and enforce
--    a CHECK so rows always carry either a channel_id or a recipient_id
--    (preventing orphaned/inaccessible inserts).
-- =====================================================================

-- Block orphan rows: a message must target either a channel or a recipient
ALTER TABLE public.org_chat_messages
  DROP CONSTRAINT IF EXISTS org_chat_messages_channel_or_recipient_chk;
ALTER TABLE public.org_chat_messages
  ADD CONSTRAINT org_chat_messages_channel_or_recipient_chk
  CHECK (channel_id IS NOT NULL OR recipient_id IS NOT NULL);

-- DM SELECT: sender or recipient may read DMs within their own org
DROP POLICY IF EXISTS "dm read sender or recipient" ON public.org_chat_messages;
CREATE POLICY "dm read sender or recipient" ON public.org_chat_messages
  FOR SELECT USING (
    channel_id IS NULL
    AND recipient_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  );

-- DM INSERT: sender must be the current user, recipient required, same org
DROP POLICY IF EXISTS "dm insert by sender" ON public.org_chat_messages;
CREATE POLICY "dm insert by sender" ON public.org_chat_messages
  FOR INSERT WITH CHECK (
    channel_id IS NULL
    AND recipient_id IS NOT NULL
    AND sender_id = auth.uid()
    AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = recipient_id AND om.organization_id = org_chat_messages.organization_id
      UNION
      SELECT 1 FROM public.org_members om2
      WHERE om2.user_id = recipient_id AND om2.org_id = org_chat_messages.organization_id
    )
  );

-- Also harden the existing channel insert to require channel_id IS NOT NULL,
-- so DMs cannot slip in through the channel policy with a NULL channel.
DROP POLICY IF EXISTS "messages insert via channel" ON public.org_chat_messages;
CREATE POLICY "messages insert via channel" ON public.org_chat_messages
  FOR INSERT WITH CHECK (
    channel_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND sender_id = auth.uid()
    AND public.can_access_chat_channel(channel_id, auth.uid())
  );

DROP POLICY IF EXISTS "messages read via channel" ON public.org_chat_messages;
CREATE POLICY "messages read via channel" ON public.org_chat_messages
  FOR SELECT USING (
    channel_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND public.can_access_chat_channel(channel_id, auth.uid())
  );
