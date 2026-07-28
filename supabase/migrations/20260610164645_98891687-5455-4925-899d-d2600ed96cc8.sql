DROP POLICY IF EXISTS "Org members can view accessible call records" ON public.pbx_call_records;
CREATE POLICY "Org members can view accessible call records"
ON public.pbx_call_records
FOR SELECT
TO authenticated
USING (
  organization_id IN (SELECT public.get_accessible_org_ids(auth.uid()))
  OR public.is_super_admin(auth.uid())
);