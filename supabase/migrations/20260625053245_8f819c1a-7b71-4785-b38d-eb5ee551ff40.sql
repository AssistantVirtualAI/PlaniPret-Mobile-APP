
CREATE INDEX IF NOT EXISTS idx_pp_calls_started_at ON public.planipret_phone_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_calls_user_started ON public.planipret_phone_calls (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_calls_direction ON public.planipret_phone_calls (direction);
CREATE INDEX IF NOT EXISTS idx_pp_calls_status ON public.planipret_phone_calls (status);
CREATE INDEX IF NOT EXISTS idx_pp_messages_created_at ON public.planipret_phone_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_messages_user_created ON public.planipret_phone_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_voicemails_created_at ON public.planipret_voicemails (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_voicemails_user_created ON public.planipret_voicemails (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_pipeline_updated ON public.planipret_pipeline (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_pipeline_user ON public.planipret_pipeline (user_id);
CREATE INDEX IF NOT EXISTS idx_pp_pipeline_stage ON public.planipret_pipeline (stage);
CREATE INDEX IF NOT EXISTS idx_pp_audit_created_at ON public.planipret_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_user_created ON public.planipret_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_action ON public.planipret_audit_log (action);
