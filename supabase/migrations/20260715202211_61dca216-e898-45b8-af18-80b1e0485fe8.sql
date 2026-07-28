
-- 1) Allow maestro_telecom provider in integration secrets
ALTER TABLE public.planipret_integration_secrets
  DROP CONSTRAINT IF EXISTS planipret_integration_secrets_provider_check;

ALTER TABLE public.planipret_integration_secrets
  ADD CONSTRAINT planipret_integration_secrets_provider_check
  CHECK (provider IN ('microsoft', 'maestro', 'maestro_telecom'));

-- 2) Link column for Maestro Telecom call records
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS maestro_call_id text;

CREATE INDEX IF NOT EXISTS idx_pp_phone_calls_maestro_call_id
  ON public.planipret_phone_calls (maestro_call_id);
