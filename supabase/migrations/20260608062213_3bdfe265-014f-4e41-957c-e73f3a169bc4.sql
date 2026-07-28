
-- Helper: can the user manage org_members of a given org (without recursion)?
CREATE OR REPLACE FUNCTION public.can_manage_org_members(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_master_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.user_id = _user_id AND m.org_id = _org_id AND m.can_manage_users = true
      );
$$;

-- Replace recursive org_members write policy
DROP POLICY IF EXISTS org_members_admin_write ON public.org_members;
CREATE POLICY org_members_admin_write ON public.org_members
  FOR ALL TO authenticated
  USING (public.can_manage_org_members(auth.uid(), org_id))
  WITH CHECK (public.can_manage_org_members(auth.uid(), org_id));

-- cc_monitor_sessions: only supervisor/admin may write
DROP POLICY IF EXISTS org_cc_monitor_sessions_all ON public.cc_monitor_sessions;
CREATE POLICY cc_monitor_sessions_read ON public.cc_monitor_sessions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.current_user_org_ids()));
CREATE POLICY cc_monitor_sessions_write ON public.cc_monitor_sessions
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (public.is_cc_supervisor(auth.uid())
         OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (public.is_cc_supervisor(auth.uid())
         OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  );

-- cc_pause_reasons: only admin/supervisor may write
DROP POLICY IF EXISTS org_cc_pause_reasons_write ON public.cc_pause_reasons;
CREATE POLICY cc_pause_reasons_write ON public.cc_pause_reasons
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (public.is_cc_supervisor(auth.uid())
         OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (public.is_cc_supervisor(auth.uid())
         OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  );

-- org_chat_channels: tighten UPDATE
DROP POLICY IF EXISTS "org members update own channels" ON public.org_chat_channels;
CREATE POLICY "org members update own channels" ON public.org_chat_channels
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (
      created_by = auth.uid()
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR (members IS NOT NULL AND auth.uid() = ANY(members))
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.current_user_org_ids())
    AND (
      created_by = auth.uid()
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR (members IS NOT NULL AND auth.uid() = ANY(members))
    )
  );

-- Storage policies
-- voicemail-audio: owner-only insert (path begins with user's UUID)
DROP POLICY IF EXISTS "voicemail_audio_owner_insert" ON storage.objects;
CREATE POLICY "voicemail_audio_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voicemail-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "voicemail_audio_owner_select" ON storage.objects;
CREATE POLICY "voicemail_audio_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voicemail-audio'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.is_super_admin(auth.uid()))
  );

-- lemtel-recordings: allow lemtel members to read
DROP POLICY IF EXISTS "lemtel_recordings_member_select" ON storage.objects;
CREATE POLICY "lemtel_recordings_member_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lemtel-recordings'
    AND public.is_lemtel_member(auth.uid())
  );
