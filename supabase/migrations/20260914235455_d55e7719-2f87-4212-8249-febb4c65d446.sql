DROP POLICY IF EXISTS "org admins view recording rules" ON public.pbx_call_recording_rules;
CREATE POLICY "org admins view recording rules"
ON public.pbx_call_recording_rules
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pbx_softphone_users spu
    WHERE spu.portal_user_id = pbx_call_recording_rules.user_id
      AND has_role(auth.uid(), spu.organization_id, 'org_admin'::app_role)
      AND (
        EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.user_id = pbx_call_recording_rules.user_id
                   AND om.organization_id = spu.organization_id)
        OR EXISTS (SELECT 1 FROM public.org_members m
                    WHERE m.user_id = pbx_call_recording_rules.user_id
                      AND m.org_id = spu.organization_id)
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = pbx_call_recording_rules.user_id
                      AND ur.organization_id = spu.organization_id)
      )
  )
);

DROP POLICY IF EXISTS "org admins view voicemail settings" ON public.pbx_voicemail_settings;
CREATE POLICY "org admins view voicemail settings"
ON public.pbx_voicemail_settings
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pbx_softphone_users spu
    WHERE spu.portal_user_id = pbx_voicemail_settings.user_id
      AND spu.organization_id = pbx_voicemail_settings.organization_id
      AND has_role(auth.uid(), pbx_voicemail_settings.organization_id, 'org_admin'::app_role)
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.planipret_maestro_activity FROM authenticated;
REVOKE ALL ON public.planipret_maestro_activity FROM anon;
GRANT SELECT ON public.planipret_maestro_activity TO authenticated;
GRANT ALL ON public.planipret_maestro_activity TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_realtime_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  UNION
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
  UNION
  SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND organization_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.current_user_realtime_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_realtime_org_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_realtime_org_ids() TO authenticated;

DROP POLICY IF EXISTS "auth org members realtime read" ON realtime.messages;
CREATE POLICY "auth org members realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
  AND ((realtime.topic())::uuid IN (SELECT public.current_user_realtime_org_ids()))
);