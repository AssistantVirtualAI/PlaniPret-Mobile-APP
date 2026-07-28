CREATE UNIQUE INDEX IF NOT EXISTS org_chat_channels_org_name_uniq
  ON public.org_chat_channels (organization_id, name)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_records_pbx_uuid_uniq
  ON public.pbx_call_records (pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_transcripts_call_record_id_uniq
  ON public.pbx_call_transcripts (call_record_id)
  WHERE call_record_id IS NOT NULL;