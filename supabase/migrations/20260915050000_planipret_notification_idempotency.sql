-- Prevent duplicate native/in-app notifications when an idempotent pipeline is retried.
CREATE UNIQUE INDEX IF NOT EXISTS planipret_ava_notifications_user_idempotency_uidx
ON public.planipret_ava_notifications (
  user_id,
  ((data ->> 'idempotency_key'))
)
WHERE data ? 'idempotency_key'
  AND NULLIF(data ->> 'idempotency_key', '') IS NOT NULL;
