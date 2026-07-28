ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS ai_analysis_json jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary_short text,
  ADD COLUMN IF NOT EXISTS next_actions jsonb;