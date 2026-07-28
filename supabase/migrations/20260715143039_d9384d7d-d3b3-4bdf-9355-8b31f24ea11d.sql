
-- 1. Org admin oversight for pbx_call_recording_rules
CREATE POLICY "org admins view recording rules"
ON public.pbx_call_recording_rules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pbx_softphone_users spu
    WHERE spu.portal_user_id = pbx_call_recording_rules.user_id
      AND has_role(auth.uid(), spu.organization_id, 'org_admin'::app_role)
  )
  OR is_super_admin(auth.uid())
);

-- 2. Org admin oversight for pbx_voicemail_settings
CREATE POLICY "org admins view voicemail settings"
ON public.pbx_voicemail_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pbx_softphone_users spu
    WHERE spu.portal_user_id = pbx_voicemail_settings.user_id
      AND has_role(auth.uid(), spu.organization_id, 'org_admin'::app_role)
  )
  OR is_super_admin(auth.uid())
);

-- 3. Validate org_chat_channels.members belong to same organization
CREATE OR REPLACE FUNCTION public.validate_org_chat_channel_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invalid_count integer;
BEGIN
  IF NEW.members IS NULL OR array_length(NEW.members, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM unnest(NEW.members) AS m(user_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = m.user_id
      AND om.organization_id = NEW.organization_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.org_members om2
    WHERE om2.user_id = m.user_id
      AND om2.org_id = NEW.organization_id
  );

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'All chat channel members must belong to the channel organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_org_chat_channel_members_trg ON public.org_chat_channels;
CREATE TRIGGER validate_org_chat_channel_members_trg
BEFORE INSERT OR UPDATE OF members, organization_id ON public.org_chat_channels
FOR EACH ROW EXECUTE FUNCTION public.validate_org_chat_channel_members();
