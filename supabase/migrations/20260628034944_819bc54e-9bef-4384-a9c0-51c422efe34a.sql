
CREATE TABLE IF NOT EXISTS public.pbx_call_live_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  call_record_id TEXT NOT NULL,
  segment_idx INT NOT NULL DEFAULT 0,
  speaker TEXT NOT NULL DEFAULT 'unknown', -- 'agent' | 'client' | 'unknown'
  source TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'partial',  -- 'partial' | 'final' | 'error'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pbx_call_live_transcripts_call_idx
  ON public.pbx_call_live_transcripts (call_record_id, segment_idx);
CREATE INDEX IF NOT EXISTS pbx_call_live_transcripts_org_idx
  ON public.pbx_call_live_transcripts (organization_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_call_live_transcripts TO authenticated;
GRANT ALL ON public.pbx_call_live_transcripts TO service_role;

ALTER TABLE public.pbx_call_live_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read live transcripts" ON public.pbx_call_live_transcripts;
CREATE POLICY "members read live transcripts"
ON public.pbx_call_live_transcripts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.organization_id = pbx_call_live_transcripts.organization_id)
  OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = pbx_call_live_transcripts.organization_id)
  OR EXISTS (SELECT 1 FROM public.pbx_softphone_users s WHERE s.portal_user_id = auth.uid() AND s.organization_id = pbx_call_live_transcripts.organization_id)
);

DROP POLICY IF EXISTS "service role writes live transcripts" ON public.pbx_call_live_transcripts;
CREATE POLICY "service role writes live transcripts"
ON public.pbx_call_live_transcripts FOR ALL TO service_role
USING (true) WITH CHECK (true);

ALTER TABLE public.pbx_call_live_transcripts REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pbx_call_live_transcripts';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_live_transcripts';
  END IF;
END $$;
