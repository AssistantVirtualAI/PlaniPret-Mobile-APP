ALTER TABLE public.pbx_extensions ADD COLUMN IF NOT EXISTS domain_uuid text;
UPDATE public.pbx_extensions SET domain_uuid = '2936594e-17b7-42a9-9165-95be48627923' WHERE domain_uuid IS NULL OR domain_uuid = '';
UPDATE public.pbx_call_records SET domain_uuid = '2936594e-17b7-42a9-9165-95be48627923'::uuid WHERE domain_uuid IS NULL;