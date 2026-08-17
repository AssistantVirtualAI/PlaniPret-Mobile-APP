ALTER TABLE public.planipret_phone_messages ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS planipret_phone_messages_idem_uidx ON public.planipret_phone_messages (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS planipret_pipeline_logs_correlation_idx ON public.planipret_pipeline_logs (correlation_id, created_at DESC);