
-- Helper: returns all planipret_profiles.id values that belong to the current auth user
CREATE OR REPLACE FUNCTION public.planipret_broker_ids(_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.planipret_profiles WHERE user_id = _uid OR id = _uid
  UNION
  SELECT _uid
$$;

GRANT EXECUTE ON FUNCTION public.planipret_broker_ids(uuid) TO authenticated, anon, service_role;

-- Update RLS so brokers see rows whose user_id matches EITHER their auth.uid()
-- OR their planipret_profiles.id (real data is keyed on profile.id).
DROP POLICY IF EXISTS pp_calls_self ON public.planipret_phone_calls;
CREATE POLICY pp_calls_self ON public.planipret_phone_calls
FOR ALL TO authenticated
USING (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()))
WITH CHECK (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()));

DROP POLICY IF EXISTS pp_msg_self ON public.planipret_phone_messages;
CREATE POLICY pp_msg_self ON public.planipret_phone_messages
FOR ALL TO authenticated
USING (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()))
WITH CHECK (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()));

DROP POLICY IF EXISTS pp_vm_self ON public.planipret_voicemails;
CREATE POLICY pp_vm_self ON public.planipret_voicemails
FOR ALL TO authenticated
USING (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()))
WITH CHECK (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()));

DROP POLICY IF EXISTS pp_reminders_self ON public.planipret_reminders;
CREATE POLICY pp_reminders_self ON public.planipret_reminders
FOR ALL TO authenticated
USING (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()))
WITH CHECK (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()));
