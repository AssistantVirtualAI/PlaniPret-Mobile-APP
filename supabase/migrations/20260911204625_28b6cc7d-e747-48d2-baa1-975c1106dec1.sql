CREATE TABLE IF NOT EXISTS public.planipret_ava_action_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  broker_id text,
  call_id text,
  session_id text,
  action text NOT NULL,
  surface text NOT NULL DEFAULT 'unknown',
  destination text,
  provider text,
  decision text NOT NULL DEFAULT 'proposed',
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  executed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  idempotency_key text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS planipret_ava_action_confirmations_idem_key
  ON public.planipret_ava_action_confirmations (idempotency_key);
CREATE INDEX IF NOT EXISTS planipret_ava_action_confirmations_user_idx
  ON public.planipret_ava_action_confirmations (user_id, created_at DESC);

GRANT SELECT ON public.planipret_ava_action_confirmations TO authenticated;
GRANT ALL ON public.planipret_ava_action_confirmations TO service_role;

ALTER TABLE public.planipret_ava_action_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp ava confirmations owner read"
  ON public.planipret_ava_action_confirmations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));

CREATE TRIGGER planipret_ava_action_confirmations_touch
  BEFORE UPDATE ON public.planipret_ava_action_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();