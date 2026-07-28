CREATE OR REPLACE FUNCTION public.current_user_softphone_domain_uuids()
RETURNS TABLE(organization_id uuid, domain_uuid text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.organization_id, s.domain_uuid::text
  FROM public.pbx_softphone_users s
  WHERE s.portal_user_id = auth.uid()
    AND s.domain_uuid IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.current_user_softphone_domain_uuids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_softphone_domain_uuids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_softphone_domain_uuids() TO service_role;

DROP POLICY IF EXISTS "domain users read same softphone directory" ON public.pbx_softphone_users;
CREATE POLICY "domain users read same softphone directory"
ON public.pbx_softphone_users
FOR SELECT
TO authenticated
USING (
  portal_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.current_user_softphone_domain_uuids() d
    WHERE d.organization_id = pbx_softphone_users.organization_id
      AND d.domain_uuid = pbx_softphone_users.domain_uuid::text
  )
);