-- Add deleted_at to org_chat_messages (referenced by client queries)
ALTER TABLE public.org_chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_org_chat_messages_deleted_at
  ON public.org_chat_messages (channel_id, created_at)
  WHERE deleted_at IS NULL;

-- Ensure pbx_ai_insights is broadcast via Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='pbx_ai_insights'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_ai_insights';
  END IF;
END$$;

ALTER TABLE public.pbx_ai_insights REPLICA IDENTITY FULL;
ALTER TABLE public.org_chat_messages REPLICA IDENTITY FULL;

-- Storage policies for call-recordings bucket: service_role full access, authenticated read via signed URLs only
CREATE POLICY "service_role full call-recordings"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'call-recordings')
  WITH CHECK (bucket_id = 'call-recordings');
