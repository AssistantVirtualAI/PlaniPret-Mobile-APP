DROP POLICY IF EXISTS "owner read greetings" ON storage.objects;
DROP POLICY IF EXISTS "owner update greetings" ON storage.objects;
DROP POLICY IF EXISTS "owner delete greetings" ON storage.objects;

CREATE POLICY "owner read greetings" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voicemail-greetings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

CREATE POLICY "owner update greetings" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'voicemail-greetings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

CREATE POLICY "owner delete greetings" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'voicemail-greetings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);