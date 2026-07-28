
-- Extend pbx_call_recordings with full metadata coverage
ALTER TABLE public.pbx_call_recordings
  ADD COLUMN IF NOT EXISTS recording_seconds integer,
  ADD COLUMN IF NOT EXISTS transcript_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transcribed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS analyzed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS access_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS sip_call_id text;

-- Unique index by (organization_id, pbx_uuid) to support idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_recordings_org_pbx_uuid_uniq
  ON public.pbx_call_recordings (organization_id, pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;

-- Mirror availability / transcription / analysis flags back to pbx_call_records
CREATE OR REPLACE FUNCTION public.pbx_call_recordings_mirror_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pbx_uuid IS NOT NULL THEN
    UPDATE public.pbx_call_records r
       SET recording_id   = NEW.id,
           has_recording  = COALESCE(NEW.available, r.has_recording, false),
           transcribed    = COALESCE(NEW.transcribed, r.transcribed, false),
           analyzed       = COALESCE(NEW.analyzed,    r.analyzed,    false),
           sentiment      = COALESCE(NEW.sentiment,   r.sentiment),
           recording_name = COALESCE(NEW.recording_name, r.recording_name),
           recording_path = COALESCE(NEW.recording_path, r.recording_path)
     WHERE r.organization_id = NEW.organization_id
       AND r.pbx_uuid = NEW.pbx_uuid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pbx_call_recordings_mirror_trg ON public.pbx_call_recordings;
CREATE TRIGGER pbx_call_recordings_mirror_trg
AFTER INSERT OR UPDATE ON public.pbx_call_recordings
FOR EACH ROW EXECUTE FUNCTION public.pbx_call_recordings_mirror_flags();

-- Ensure pbx_call_records has recording_id column
ALTER TABLE public.pbx_call_records
  ADD COLUMN IF NOT EXISTS recording_id uuid;
