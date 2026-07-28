
-- AVA Learning Loop: feedback + learned preferences
CREATE TABLE public.planipret_ava_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id UUID NOT NULL,
  analysis_id UUID REFERENCES public.planipret_ava_email_analyses(id) ON DELETE CASCADE,
  action_id TEXT,
  action_type TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('up','down','skipped','modified')),
  comment TEXT,
  original_draft TEXT,
  final_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ava_feedback TO authenticated;
GRANT ALL ON public.planipret_ava_feedback TO service_role;
ALTER TABLE public.planipret_ava_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback" ON public.planipret_ava_feedback
  FOR ALL USING (auth.uid() = broker_user_id) WITH CHECK (auth.uid() = broker_user_id);
CREATE INDEX idx_ava_feedback_broker ON public.planipret_ava_feedback(broker_user_id, created_at DESC);

CREATE TABLE public.planipret_ava_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  preferences_text TEXT NOT NULL,
  sample_size INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planipret_ava_prompt_versions TO authenticated;
GRANT ALL ON public.planipret_ava_prompt_versions TO service_role;
ALTER TABLE public.planipret_ava_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prompt versions" ON public.planipret_ava_prompt_versions
  FOR SELECT USING (auth.uid() = broker_user_id);
CREATE INDEX idx_ava_prompt_broker_active ON public.planipret_ava_prompt_versions(broker_user_id, active);

ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ava_learned_preferences TEXT,
  ADD COLUMN IF NOT EXISTS ava_learned_updated_at TIMESTAMPTZ;

-- Schedule daily prompt tuner at 03:15 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('ava-prompt-tuner-daily') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname='ava-prompt-tuner-daily'
    );
    PERFORM cron.schedule(
      'ava-prompt-tuner-daily',
      '15 3 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/ava-prompt-tuner',
        headers := jsonb_build_object('Content-Type','application/json','x-ava-service', current_setting('app.settings.service_role_key', true)),
        body := jsonb_build_object('all', true)
      );
      $cron$
    );
  END IF;
END $$;
