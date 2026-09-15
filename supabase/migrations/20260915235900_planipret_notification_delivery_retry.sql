-- Track delivery attempts separately from in-app notification creation so a
-- retry with the same idempotency key can resend a previously undelivered push.
ALTER TABLE public.planipret_ava_notifications
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_delivery_error text;

CREATE INDEX IF NOT EXISTS planipret_ava_notifications_pending_delivery_idx
  ON public.planipret_ava_notifications (created_at)
  WHERE delivered = false;

NOTIFY pgrst, 'reload schema';
