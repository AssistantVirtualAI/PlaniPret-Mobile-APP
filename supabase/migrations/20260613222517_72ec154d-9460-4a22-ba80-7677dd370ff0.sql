ALTER TABLE public.pbx_voicemails
  ADD COLUMN IF NOT EXISTS pbx_record_path text,
  ADD COLUMN IF NOT EXISTS pbx_record_name text;