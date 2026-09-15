-- Prevent duplicate native/in-app notifications when an idempotent pipeline is retried.
ALTER TABLE public.planipret_ava_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS planipret_ava_notifications_idem_uidx
  ON public.planipret_ava_notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
