DROP POLICY IF EXISTS "pbx_audio_read_authenticated" ON storage.objects;

CREATE POLICY "pbx_audio_read_scoped"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'pbx-audio'
  AND (
    name IN ('call-recording-notice.wav')
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pbx_ivr_audio a
      WHERE a.storage_path = storage.objects.name
        AND a.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.pbx_hold_music h
      WHERE (h.storage_path = storage.objects.name OR h.path = storage.objects.name)
        AND h.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.pbx_voicemail_greetings g
      WHERE g.storage_path = storage.objects.name
        AND g.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
  )
);