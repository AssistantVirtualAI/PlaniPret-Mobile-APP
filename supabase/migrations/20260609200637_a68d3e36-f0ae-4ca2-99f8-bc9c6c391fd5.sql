
-- 1) Drop sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.pbx_voicemails;
ALTER PUBLICATION supabase_realtime DROP TABLE public.pbx_call_records;
ALTER PUBLICATION supabase_realtime DROP TABLE public.pbx_softphone_users;
ALTER PUBLICATION supabase_realtime DROP TABLE public.cc_agent_activity;

-- 2) Voicemail audio storage: add UPDATE/DELETE for org_admins (and owners)
DROP POLICY IF EXISTS "voicemail_audio_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "voicemail_audio_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "voicemail_audio_owner_delete" ON storage.objects;

CREATE POLICY "voicemail_audio_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'voicemail-audio'
  AND EXISTS (
    SELECT 1 FROM public.pbx_voicemails v
    WHERE v.audio_storage_path = storage.objects.name
      AND (
        public.has_role(auth.uid(), v.organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
)
WITH CHECK (
  bucket_id = 'voicemail-audio'
  AND EXISTS (
    SELECT 1 FROM public.pbx_voicemails v
    WHERE v.audio_storage_path = storage.objects.name
      AND (
        public.has_role(auth.uid(), v.organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);

CREATE POLICY "voicemail_audio_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voicemail-audio'
  AND EXISTS (
    SELECT 1 FROM public.pbx_voicemails v
    JOIN public.pbx_softphone_users s
      ON s.organization_id = v.organization_id AND s.extension = v.extension
    WHERE v.audio_storage_path = storage.objects.name
      AND (
        s.portal_user_id = auth.uid()
        OR public.has_role(auth.uid(), v.organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(auth.uid())
      )
  )
);
