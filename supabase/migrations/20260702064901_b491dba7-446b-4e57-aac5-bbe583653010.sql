
-- Analyses de courriels par AVA
CREATE TABLE public.planipret_ava_email_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL,
  broker_user_id uuid NOT NULL,
  ms_message_id text NOT NULL,
  email_subject text,
  email_from text,
  email_from_name text,
  received_at timestamptz,
  intent text,
  urgency text,
  lead_score int,
  key_info jsonb,
  proposed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification_summary text,
  raw_ai_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_user_id, ms_message_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ava_email_analyses TO authenticated;
GRANT ALL ON public.planipret_ava_email_analyses TO service_role;

ALTER TABLE public.planipret_ava_email_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AVA analyses: broker reads own"
  ON public.planipret_ava_email_analyses
  FOR SELECT TO authenticated
  USING (broker_user_id = auth.uid());

CREATE POLICY "AVA analyses: broker deletes own"
  ON public.planipret_ava_email_analyses
  FOR DELETE TO authenticated
  USING (broker_user_id = auth.uid());

CREATE INDEX planipret_ava_email_analyses_broker_idx
  ON public.planipret_ava_email_analyses(broker_user_id, created_at DESC);

-- Journal des actions AVA
CREATE TABLE public.planipret_ava_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid,
  broker_user_id uuid NOT NULL,
  analysis_id uuid REFERENCES public.planipret_ava_email_analyses(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  action_params jsonb,
  modified_content text,
  execution_mode text NOT NULL DEFAULT 'live',
  success boolean,
  result jsonb,
  error text,
  modified_by_broker boolean DEFAULT false,
  executed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ava_action_log TO authenticated;
GRANT ALL ON public.planipret_ava_action_log TO service_role;

ALTER TABLE public.planipret_ava_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AVA action log: broker reads own"
  ON public.planipret_ava_action_log
  FOR SELECT TO authenticated
  USING (broker_user_id = auth.uid());

CREATE INDEX planipret_ava_action_log_broker_idx
  ON public.planipret_ava_action_log(broker_user_id, executed_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_ava_email_analyses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_ava_action_log;
