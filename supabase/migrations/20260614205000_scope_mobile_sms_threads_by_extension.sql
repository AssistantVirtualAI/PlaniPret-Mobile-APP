-- Add optional extension scope fields for SMS threads used by desktop/mobile end-user filtering.
-- `extension` stores the human extension number such as 300; `extension_uuid` stores the PBX UUID when available.
ALTER TABLE public.pbx_sms_threads
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS extension_uuid uuid;

CREATE INDEX IF NOT EXISTS idx_pbx_sms_threads_softphone_scope
  ON public.pbx_sms_threads (organization_id, extension_uuid, extension, last_message_at DESC);
