-- Remove the single legacy row without pbx_uuid so we can enforce NOT NULL uniqueness
DELETE FROM public.pbx_call_records WHERE pbx_uuid IS NULL;

-- Drop the partial unique indexes (ON CONFLICT inference cannot use partial indexes via PostgREST)
DROP INDEX IF EXISTS public.pbx_call_records_org_pbx_uuid_uniq;
DROP INDEX IF EXISTS public.pbx_call_records_pbx_uuid_uniq;

-- Recreate as a real (non-partial) unique constraint that ON CONFLICT can target
ALTER TABLE public.pbx_call_records
  ALTER COLUMN pbx_uuid SET NOT NULL;

ALTER TABLE public.pbx_call_records
  ADD CONSTRAINT pbx_call_records_org_pbx_uuid_key UNIQUE (organization_id, pbx_uuid);