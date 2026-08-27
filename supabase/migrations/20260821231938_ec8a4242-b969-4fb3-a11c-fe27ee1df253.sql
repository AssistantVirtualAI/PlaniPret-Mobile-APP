-- 1) Backfill commission rows to a stable broker id before removing the name fallback
UPDATE public.planipret_commission_stats s
SET broker_user_id = p.user_id
FROM public.planipret_profiles p
WHERE s.broker_user_id IS NULL
  AND lower(trim(coalesce(p.full_name,''))) = lower(trim(coalesce(s.broker_name,'')))
  AND coalesce(trim(s.broker_name),'') <> '';

-- 2) Commission stats: match only on the immutable broker_user_id
DROP POLICY IF EXISTS pcs_broker_read_own ON public.planipret_commission_stats;
CREATE POLICY pcs_broker_read_own
ON public.planipret_commission_stats
FOR SELECT
TO authenticated
USING (broker_user_id = auth.uid());

-- 3) DID assignments: join on the immutable profile user_id, not mutable extension/domain
DROP POLICY IF EXISTS "Planipret brokers read own DID assignments" ON public.planipret_did_assignments;
CREATE POLICY "Planipret brokers read own DID assignments"
ON public.planipret_did_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.planipret_profiles p
    WHERE p.user_id = auth.uid()
      AND p.extension = planipret_did_assignments.extension
      AND p.ns_domain = planipret_did_assignments.domain
  )
);

-- 4) Make identity / routing columns immutable for self-service updates.
CREATE OR REPLACE FUNCTION public.pp_profiles_guard_identity_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / internal jobs (no JWT) and Planiprêt admins may change identity columns
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
     OR NEW.maestro_broker_id IS DISTINCT FROM OLD.maestro_broker_id THEN
    RAISE EXCEPTION 'Identity and routing fields can only be changed by a Planipret administrator';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pp_profiles_guard_identity_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pp_profiles_guard_identity ON public.planipret_profiles;
CREATE TRIGGER pp_profiles_guard_identity
BEFORE UPDATE ON public.planipret_profiles
FOR EACH ROW EXECUTE FUNCTION public.pp_profiles_guard_identity_columns();