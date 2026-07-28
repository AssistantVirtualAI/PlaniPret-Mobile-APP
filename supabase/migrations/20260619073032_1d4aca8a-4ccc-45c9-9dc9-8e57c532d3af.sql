ALTER TABLE public.pbx_voicemail_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.pbx_voicemail_settings s
SET organization_id = u.organization_id
FROM public.pbx_softphone_users u
WHERE s.user_id = u.portal_user_id
  AND s.organization_id IS NULL;