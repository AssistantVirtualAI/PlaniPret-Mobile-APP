
-- Auto-configure integrations from secret writes
CREATE OR REPLACE FUNCTION public.pp_autoconfigure_from_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _key text;
BEGIN
  _key := CASE lower(NEW.provider)
    WHEN 'microsoft' THEN 'ms365'
    WHEN 'ms365'     THEN 'ms365'
    WHEN 'nsapi'     THEN 'ns_api'
    WHEN 'ns_api'    THEN 'ns_api'
    WHEN 'maestro'   THEN 'maestro'
    WHEN 'elevenlabs' THEN 'elevenlabs'
    WHEN 'anthropic'  THEN 'anthropic'
    ELSE NULL
  END;
  IF _key IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.planipret_integration_config (integration_key, is_enabled, is_configured, updated_at)
  VALUES (_key, true, true, now())
  ON CONFLICT (integration_key) DO UPDATE
    SET is_configured = true, is_enabled = true, updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pp_autoconfigure_from_secret ON public.planipret_integration_secrets;
CREATE TRIGGER trg_pp_autoconfigure_from_secret
AFTER INSERT OR UPDATE ON public.planipret_integration_secrets
FOR EACH ROW EXECUTE FUNCTION public.pp_autoconfigure_from_secret();

-- Also auto-configure when a broker connects MS365 / Maestro on their profile
CREATE OR REPLACE FUNCTION public.pp_autoconfigure_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ms365_refresh_token IS NOT NULL AND (OLD.ms365_refresh_token IS DISTINCT FROM NEW.ms365_refresh_token) THEN
    INSERT INTO public.planipret_integration_config (integration_key, is_enabled, is_configured, updated_at)
    VALUES ('ms365', true, true, now())
    ON CONFLICT (integration_key) DO UPDATE SET is_configured = true, updated_at = now();
  END IF;
  IF NEW.maestro_broker_token IS NOT NULL AND (OLD.maestro_broker_token IS DISTINCT FROM NEW.maestro_broker_token) THEN
    INSERT INTO public.planipret_integration_config (integration_key, is_enabled, is_configured, updated_at)
    VALUES ('maestro', true, true, now())
    ON CONFLICT (integration_key) DO UPDATE SET is_configured = true, updated_at = now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pp_autoconfigure_from_profile ON public.planipret_profiles;
CREATE TRIGGER trg_pp_autoconfigure_from_profile
AFTER INSERT OR UPDATE OF ms365_refresh_token, maestro_broker_token ON public.planipret_profiles
FOR EACH ROW EXECUTE FUNCTION public.pp_autoconfigure_from_profile();

-- Backfill: mark ms365 configured since Microsoft secret row already exists
UPDATE public.planipret_integration_config
   SET is_configured = true, updated_at = now()
 WHERE integration_key = 'ms365'
   AND EXISTS (SELECT 1 FROM public.planipret_integration_secrets WHERE provider IN ('microsoft','ms365'));
