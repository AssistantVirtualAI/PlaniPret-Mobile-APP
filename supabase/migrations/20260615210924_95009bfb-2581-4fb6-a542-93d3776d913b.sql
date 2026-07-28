
-- 1) CDR uniqueness
DROP INDEX IF EXISTS public.pbx_call_records_org_sip_call_id_uniq;
ALTER TABLE public.pbx_call_records DROP CONSTRAINT IF EXISTS pbx_call_records_pbx_uuid_key;

ALTER TABLE public.pbx_call_records
  ADD COLUMN IF NOT EXISTS pbx_dedup_key text;

CREATE OR REPLACE FUNCTION public.pbx_call_records_set_dedup_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.pbx_dedup_key := md5(
    NEW.organization_id::text || '|' ||
    COALESCE(
      NEW.pbx_uuid,
      COALESCE(NEW.sip_call_id,'') || '|' ||
      COALESCE(to_char(NEW.start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS'),'') || '|' ||
      COALESCE(NEW.destination_number,'') || '|' ||
      COALESCE(NEW.extension,'') || '|' ||
      COALESCE(NEW.direction,'') || '|' ||
      COALESCE(NEW.duration_seconds::text,'')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pbx_call_records_set_dedup_key_t ON public.pbx_call_records;
CREATE TRIGGER pbx_call_records_set_dedup_key_t
  BEFORE INSERT OR UPDATE ON public.pbx_call_records
  FOR EACH ROW EXECUTE FUNCTION public.pbx_call_records_set_dedup_key();

-- Backfill
UPDATE public.pbx_call_records SET pbx_dedup_key = md5(
  organization_id::text || '|' ||
  COALESCE(
    pbx_uuid,
    COALESCE(sip_call_id,'') || '|' ||
    COALESCE(to_char(start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS'),'') || '|' ||
    COALESCE(destination_number,'') || '|' ||
    COALESCE(extension,'') || '|' ||
    COALESCE(direction,'') || '|' ||
    COALESCE(duration_seconds::text,'')
  )
) WHERE pbx_dedup_key IS NULL;

-- Delete legacy duplicates, keep the oldest of each (organization_id, pbx_dedup_key)
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, pbx_dedup_key
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.pbx_call_records
  WHERE pbx_dedup_key IS NOT NULL
)
DELETE FROM public.pbx_call_records r
USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_records_dedup_uniq
  ON public.pbx_call_records (organization_id, pbx_dedup_key);

DROP INDEX IF EXISTS public.idx_pbx_call_records_org_start;

-- 2) Sync job tracking
ALTER TABLE public.pbx_sync_jobs
  ADD COLUMN IF NOT EXISTS fetched integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upserted integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- 3) Recording metadata
ALTER TABLE public.pbx_call_recordings
  ADD COLUMN IF NOT EXISTS recording_name text,
  ADD COLUMN IF NOT EXISTS recording_path text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS summary_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_recordings_org_pbx_uuid_uniq
  ON public.pbx_call_recordings (organization_id, pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;

-- 4) Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pbx_extensions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_extensions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='audit_logs') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs';
  END IF;
END $$;
