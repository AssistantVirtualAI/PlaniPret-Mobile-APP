
CREATE OR REPLACE FUNCTION public.guard_no_lemtel_in_planipret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) ~ '@lemtel\.com$' THEN
    RAISE EXCEPTION 'Les emails @lemtel.com ne peuvent pas être membres de Planiprêt (%)', NEW.email
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_no_lemtel_in_planipret ON public.planipret_profiles;
CREATE TRIGGER trg_guard_no_lemtel_in_planipret
BEFORE INSERT OR UPDATE OF email ON public.planipret_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_no_lemtel_in_planipret();

CREATE OR REPLACE FUNCTION public.guard_no_lemtel_in_planipret_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text;
BEGIN
  IF NEW.role::text NOT IN ('planipret_broker','planipret_admin') THEN RETURN NEW; END IF;
  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = NEW.user_id;
  IF _email IS NOT NULL AND _email ~ '@lemtel\.com$' THEN
    RAISE EXCEPTION 'Les comptes @lemtel.com ne peuvent pas avoir de rôle Planiprêt (%)', _email
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_no_lemtel_in_planipret_roles ON public.user_roles;
CREATE TRIGGER trg_guard_no_lemtel_in_planipret_roles
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_no_lemtel_in_planipret_roles();

-- Cleanup: drop roles first, then profiles. Skip audit FK to avoid blocking purge.
DELETE FROM public.user_roles
 WHERE role::text IN ('planipret_broker','planipret_admin')
   AND organization_id = public.planipret_ava_org_id()
   AND user_id IN (
     SELECT user_id FROM public.planipret_profiles
      WHERE email IS NOT NULL AND lower(email) ~ '@lemtel\.com$'
   );

INSERT INTO public.planipret_audit_log (user_id, action, resource_type, resource_id, metadata)
SELECT NULL, 'purge_lemtel_domain', 'planipret_profiles', user_id::text,
       jsonb_build_object('email', email, 'purged_user_id', user_id)
  FROM public.planipret_profiles
 WHERE email IS NOT NULL AND lower(email) ~ '@lemtel\.com$';

DELETE FROM public.planipret_profiles
 WHERE email IS NOT NULL AND lower(email) ~ '@lemtel\.com$';
