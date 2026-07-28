
-- Tighten is_my_extension_call to strict extension identity matching
CREATE OR REPLACE FUNCTION public.is_my_extension_call(_org_id uuid, _extension text, _caller text, _destination text, _source text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pbx_softphone_users s
    WHERE s.portal_user_id = auth.uid()
      AND s.organization_id = _org_id
      AND s.extension = _extension
  )
$$;

CREATE OR REPLACE FUNCTION public.is_my_extension_call(_org_id uuid, _extension text, _extension_uuid uuid, _caller text, _destination_number text, _destination text, _source text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pbx_softphone_users s
    LEFT JOIN public.pbx_extensions e
      ON e.organization_id = s.organization_id
     AND (e.id = s.extension_id OR e.extension = s.extension)
    WHERE s.portal_user_id = auth.uid()
      AND s.organization_id = _org_id
      AND (
        s.extension = _extension
        OR (e.pbx_uuid IS NOT NULL AND _extension_uuid IS NOT NULL AND e.pbx_uuid = _extension_uuid::text)
      )
  )
$$;

-- Tighten org_role_permissions view policy: require both org membership AND admin/manager role in that specific org
DROP POLICY IF EXISTS "Admins and managers can view role permissions" ON public.org_role_permissions;
CREATE POLICY "Admins and managers can view role permissions"
ON public.org_role_permissions
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = org_role_permissions.organization_id
        AND m.user_id = auth.uid()
    )
    AND (
      has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR has_role(auth.uid(), organization_id, 'manager'::app_role)
    )
  )
);

-- Enforce expiry (15 min) on planipret_maestro_oauth_states via RLS policy
DROP POLICY IF EXISTS "users manage own oauth states" ON public.planipret_maestro_oauth_states;
CREATE POLICY "users read own non-expired oauth states"
ON public.planipret_maestro_oauth_states FOR SELECT
USING (auth.uid() = user_id AND created_at > now() - interval '15 minutes');

CREATE POLICY "users insert own oauth states"
ON public.planipret_maestro_oauth_states FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own oauth states"
ON public.planipret_maestro_oauth_states FOR DELETE
USING (auth.uid() = user_id);

-- Cleanup helper to purge expired rows
CREATE OR REPLACE FUNCTION public.cleanup_expired_maestro_oauth_states()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.planipret_maestro_oauth_states WHERE created_at < now() - interval '1 hour';
$$;
