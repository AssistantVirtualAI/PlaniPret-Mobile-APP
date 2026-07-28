
-- 1) pbx_conferences: hide PIN columns from clients
REVOKE SELECT (pin, moderator_pin) ON public.pbx_conferences FROM anon, authenticated;

-- 2) cc_monitor_sessions: restrict SELECT to supervisors/admins
DROP POLICY IF EXISTS "cc_monitor_sessions_read" ON public.cc_monitor_sessions;
DROP POLICY IF EXISTS "org_cc_monitor_sessions_select" ON public.cc_monitor_sessions;
CREATE POLICY "cc_monitor_sessions_read_privileged"
ON public.cc_monitor_sessions
FOR SELECT
TO authenticated
USING (
  organization_id IN (SELECT public.current_user_org_ids())
  AND (
    public.is_cc_supervisor(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.is_super_admin(auth.uid())
  )
);

-- 3) cc_report_schedules: restrict SELECT to supervisors/admins/managers
DROP POLICY IF EXISTS "cc_report_schedules_select" ON public.cc_report_schedules;
CREATE POLICY "cc_report_schedules_select_privileged"
ON public.cc_report_schedules
FOR SELECT
TO authenticated
USING (
  organization_id IN (SELECT public.current_user_org_ids())
  AND (
    public.is_cc_supervisor(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR public.is_super_admin(auth.uid())
  )
);

-- 4) organizations: hide sensitive infrastructure/billing fields from regular members.
--    Admins read these via SECURITY DEFINER RPC or edge functions (service_role).
REVOKE SELECT (
  fusionpbx_server_url,
  fusionpbx_domain_uuid,
  fusionpbx_domain_name,
  stripe_customer_id,
  billing_email
) ON public.organizations FROM anon, authenticated;

-- Admin-only RPC returning the domain map (used by lemtel admin tools).
CREATE OR REPLACE FUNCTION public.get_org_pbx_mapping()
RETURNS TABLE(id uuid, name text, fusionpbx_domain_uuid text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.fusionpbx_domain_uuid
  FROM public.organizations o
  WHERE public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_org_pbx_mapping() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_pbx_mapping() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_org_by_fusionpbx_domain(_domain_uuid text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE o.fusionpbx_domain_uuid = _domain_uuid
    AND (public.is_lemtel_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.get_org_by_fusionpbx_domain(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_by_fusionpbx_domain(text) TO authenticated;
