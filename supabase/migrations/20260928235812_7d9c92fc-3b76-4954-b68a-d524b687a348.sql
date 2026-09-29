CREATE OR REPLACE FUNCTION public.pp_profiles_guard_identity_columns()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_planipret_admin(auth.uid())
     OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.extension IS DISTINCT FROM OLD.extension
     OR NEW.ns_extension IS DISTINCT FROM OLD.ns_extension
     OR NEW.ns_domain IS DISTINCT FROM OLD.ns_domain
     OR NEW.ns_user_id IS DISTINCT FROM OLD.ns_user_id
     OR NEW.sip_username IS DISTINCT FROM OLD.sip_username
     OR NEW.sip_domain IS DISTINCT FROM OLD.sip_domain
     OR NEW.maestro_broker_id IS DISTINCT FROM OLD.maestro_broker_id
     OR NEW.maestro_telecom_user_id IS DISTINCT FROM OLD.maestro_telecom_user_id THEN
    RAISE EXCEPTION 'Identity and routing fields can only be changed by a Planipret administrator';
  END IF;
  RETURN NEW;
END;
$function$;