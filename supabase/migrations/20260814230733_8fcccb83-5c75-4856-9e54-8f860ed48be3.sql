ALTER TABLE public.planipret_pipeline_logs
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS http_status integer;

CREATE INDEX IF NOT EXISTS planipret_pipeline_logs_correlation_idx ON public.planipret_pipeline_logs (correlation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS planipret_pipeline_logs_entity_idx ON public.planipret_pipeline_logs (entity_type, entity_id, created_at DESC);