DROP POLICY IF EXISTS "organization-assets image-only insert" ON storage.objects;
DROP POLICY IF EXISTS "lemtel recordings strict path on write" ON storage.objects;

CREATE POLICY "organization-assets image-only insert"
ON storage.objects AS RESTRICTIVE FOR INSERT TO public
WITH CHECK (
  bucket_id <> 'organization-assets'
  OR COALESCE(metadata ->> 'mimetype', '') LIKE 'image/%'
);

CREATE POLICY "lemtel recordings strict path on write"
ON storage.objects AS RESTRICTIVE FOR INSERT TO public
WITH CHECK (
  bucket_id <> 'lemtel-recordings'
  OR (
    is_lemtel_admin(auth.uid())
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lemtel_customers c
      WHERE c.domain_uuid = (storage.foldername(objects.name))[1]
        AND c.id::text = (storage.foldername(objects.name))[2]
    )
  )
);