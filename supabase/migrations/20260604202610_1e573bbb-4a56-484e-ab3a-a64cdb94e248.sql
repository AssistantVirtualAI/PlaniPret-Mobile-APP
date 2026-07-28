
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS allowed_platforms text[];

UPDATE public.organizations
SET allowed_platforms = ARRAY['elevenlabs','twilio']
WHERE id = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
