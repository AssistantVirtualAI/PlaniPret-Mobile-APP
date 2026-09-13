ALTER TABLE public.planipret_phone_calls ADD COLUMN IF NOT EXISTS transcript_status text;

UPDATE public.planipret_phone_calls
SET transcript_status = 'no_audio', transcript_pending = false
WHERE transcript IS NULL AND transcript_pending = true AND COALESCE(transcript_attempts,0) >= 6;

UPDATE public.planipret_phone_calls
SET transcript_status = 'done'
WHERE transcript IS NOT NULL AND transcript_status IS NULL;