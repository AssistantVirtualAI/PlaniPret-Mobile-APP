-- Ensure the private lemtel-recordings bucket exists.
-- This bucket is used by fusionpbx-proxy (get-recording-signed-url) to
-- temporarily store recording bytes fetched from the PBX and issue
-- short-lived signed URLs to the mobile/desktop clients.
-- The bucket is private (public = false) — all access goes through
-- signed URLs issued by the service-role edge function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lemtel-recordings',
  'lemtel-recordings',
  false,
  52428800,  -- 50 MB per file
  ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-wav', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
