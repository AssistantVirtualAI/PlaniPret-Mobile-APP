
ALTER TABLE public.pbx_call_records
  ADD COLUMN IF NOT EXISTS extension_uuid uuid,
  ADD COLUMN IF NOT EXISTS domain_uuid uuid,
  ADD COLUMN IF NOT EXISTS domain_name text,
  ADD COLUMN IF NOT EXISTS source_number text,
  ADD COLUMN IF NOT EXISTS destination_number text,
  ADD COLUMN IF NOT EXISTS recording_path text,
  ADD COLUMN IF NOT EXISTS recording_name text,
  ADD COLUMN IF NOT EXISTS hangup_cause text,
  ADD COLUMN IF NOT EXISTS sip_call_id text,
  ADD COLUMN IF NOT EXISTS ivr_menu_uuid uuid,
  ADD COLUMN IF NOT EXISTS ring_group_uuid uuid,
  ADD COLUMN IF NOT EXISTS waitsec integer,
  ADD COLUMN IF NOT EXISTS pdd_ms integer;

-- voicemail_message: convert boolean → text (preserve nothing; field is informational)
ALTER TABLE public.pbx_call_records
  ALTER COLUMN voicemail_message DROP DEFAULT,
  ALTER COLUMN voicemail_message TYPE text USING NULL,
  ALTER COLUMN voicemail_message DROP NOT NULL;
