
ALTER TABLE public.pbx_voicemail_settings 
  ADD COLUMN IF NOT EXISTS greeting_voice_id text,
  ADD COLUMN IF NOT EXISTS greeting_voice_name text,
  ADD COLUMN IF NOT EXISTS ai_summary_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS greeting_audio_url text,
  ADD COLUMN IF NOT EXISTS greeting_updated_at timestamptz;

-- Helper: user can access voicemail row
CREATE OR REPLACE FUNCTION public.can_access_voicemail(_user_id uuid, _vm_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pbx_voicemails v
    JOIN public.pbx_softphone_users s
      ON s.organization_id = v.organization_id
     AND s.extension = v.extension
    WHERE v.id = _vm_id
      AND (
        s.portal_user_id = _user_id
        OR public.has_role(_user_id, v.organization_id, 'org_admin'::app_role)
        OR public.is_super_admin(_user_id)
      )
  )
$$;
