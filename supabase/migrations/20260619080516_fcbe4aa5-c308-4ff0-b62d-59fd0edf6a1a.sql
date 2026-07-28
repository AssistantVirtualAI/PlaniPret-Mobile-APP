
-- 1) Fix code/schema mismatch: pbx_call_recordings.ai_summary missing (error 42703).
ALTER TABLE public.pbx_call_recordings ADD COLUMN IF NOT EXISTS ai_summary text;
UPDATE public.pbx_call_recordings
   SET ai_summary = summary
 WHERE ai_summary IS NULL AND summary IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pbx_call_recordings_sync_ai_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.summary IS DISTINCT FROM OLD.summary AND (NEW.ai_summary IS NULL OR NEW.ai_summary = COALESCE(OLD.summary,'')) THEN
    NEW.ai_summary := NEW.summary;
  END IF;
  IF NEW.ai_summary IS DISTINCT FROM COALESCE(OLD.ai_summary,'') AND (NEW.summary IS NULL OR NEW.summary = COALESCE(OLD.ai_summary,'')) THEN
    NEW.summary := COALESCE(NEW.ai_summary, NEW.summary);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pbx_call_recordings_sync_ai_summary ON public.pbx_call_recordings;
CREATE TRIGGER trg_pbx_call_recordings_sync_ai_summary
BEFORE INSERT OR UPDATE ON public.pbx_call_recordings
FOR EACH ROW EXECUTE FUNCTION public.pbx_call_recordings_sync_ai_summary();

-- 2) Re-issue Data API GRANTs (idempotent) for the tables/views the mobile app reads.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_chat_message_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_presence TO authenticated;
GRANT SELECT ON public.pbx_softphone_users_safe TO authenticated;
GRANT SELECT ON public.pbx_call_records TO authenticated;
GRANT SELECT ON public.pbx_call_recordings TO authenticated;

GRANT ALL ON public.org_chat_channels TO service_role;
GRANT ALL ON public.org_chat_messages TO service_role;
GRANT ALL ON public.org_chat_reads TO service_role;
GRANT ALL ON public.org_chat_message_receipts TO service_role;
GRANT ALL ON public.org_contacts TO service_role;
GRANT ALL ON public.user_presence TO service_role;
GRANT ALL ON public.pbx_call_records TO service_role;
GRANT ALL ON public.pbx_call_recordings TO service_role;
GRANT ALL ON public.pbx_softphone_users TO service_role;
