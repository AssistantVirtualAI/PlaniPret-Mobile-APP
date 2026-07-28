
CREATE OR REPLACE FUNCTION public.create_planipret_sip_secret(_name text, _value text, _broker_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _id uuid;
  _existing uuid;
BEGIN
  -- Update if exists, else create
  SELECT id INTO _existing FROM vault.secrets WHERE name = _name LIMIT 1;
  IF _existing IS NOT NULL THEN
    PERFORM vault.update_secret(_existing, _value, _name);
    RETURN _name;
  END IF;
  SELECT vault.create_secret(_value, _name) INTO _id;
  RETURN _name;
END
$$;

REVOKE ALL ON FUNCTION public.create_planipret_sip_secret(text, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.create_planipret_sip_secret(text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_planipret_sip_secret(text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_planipret_sip_secret(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.read_planipret_sip_secret(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE _v text;
BEGIN
  SELECT decrypted_secret INTO _v FROM vault.decrypted_secrets WHERE name = _name LIMIT 1;
  RETURN _v;
END
$$;

REVOKE ALL ON FUNCTION public.read_planipret_sip_secret(text) FROM public;
REVOKE ALL ON FUNCTION public.read_planipret_sip_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.read_planipret_sip_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_planipret_sip_secret(text) TO service_role;
