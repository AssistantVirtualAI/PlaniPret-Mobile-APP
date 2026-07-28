CREATE TABLE public.planipret_integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE CHECK (provider IN ('microsoft','maestro')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.planipret_integration_secrets TO service_role;
ALTER TABLE public.planipret_integration_secrets ENABLE ROW LEVEL SECURITY;

-- No client-side policies: only service_role (via edge function gated by owner UUID) may read/write.
-- This guarantees secrets are never exposed through PostgREST to any other user.

CREATE TRIGGER tr_pp_int_secrets_updated
  BEFORE UPDATE ON public.planipret_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();