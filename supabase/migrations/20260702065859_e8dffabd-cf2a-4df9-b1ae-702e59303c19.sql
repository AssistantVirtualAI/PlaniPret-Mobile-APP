
CREATE TABLE IF NOT EXISTS public.planipret_ava_mail_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id uuid NOT NULL,
  broker_id uuid,
  ms_subscription_id text NOT NULL UNIQUE,
  resource text NOT NULL,
  client_state text NOT NULL,
  notification_url text NOT NULL,
  expiration_datetime timestamptz NOT NULL,
  last_renewed_at timestamptz,
  last_notification_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.planipret_ava_mail_subscriptions TO authenticated;
GRANT ALL ON public.planipret_ava_mail_subscriptions TO service_role;

ALTER TABLE public.planipret_ava_mail_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker can view own mail subs"
  ON public.planipret_ava_mail_subscriptions FOR SELECT
  TO authenticated USING (broker_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ava_mail_subs_exp ON public.planipret_ava_mail_subscriptions(expiration_datetime);
CREATE INDEX IF NOT EXISTS idx_ava_mail_subs_user ON public.planipret_ava_mail_subscriptions(broker_user_id);
