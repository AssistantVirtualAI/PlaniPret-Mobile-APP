
-- Phase 2: additive inventory columns
ALTER TABLE public.pbx_extensions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'fusionpbx',
  ADD COLUMN IF NOT EXISTS last_pbx_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.pbx_devices
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'fusionpbx',
  ADD COLUMN IF NOT EXISTS domain_uuid text,
  ADD COLUMN IF NOT EXISTS last_pbx_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.pbx_destinations
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'fusionpbx',
  ADD COLUMN IF NOT EXISTS domain_uuid text,
  ADD COLUMN IF NOT EXISTS last_pbx_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'ava',
  ADD COLUMN IF NOT EXISTS pbx_uuid text,
  ADD COLUMN IF NOT EXISTS domain_uuid text,
  ADD COLUMN IF NOT EXISTS last_pbx_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS domain_uuid text,
  ADD COLUMN IF NOT EXISTS last_pbx_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- pbx_admin_users — FusionPBX backoffice accounts
CREATE TABLE IF NOT EXISTS public.pbx_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pbx_uuid text NOT NULL,
  domain_uuid text,
  username text NOT NULL,
  email text,
  first_name text,
  last_name text,
  groups text[] DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT true,
  api_key_present boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'fusionpbx',
  last_pbx_seen_at timestamptz,
  sync_status text NOT NULL DEFAULT 'synced',
  is_demo boolean NOT NULL DEFAULT false,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pbx_uuid)
);

GRANT SELECT ON public.pbx_admin_users TO authenticated;
GRANT ALL ON public.pbx_admin_users TO service_role;
ALTER TABLE public.pbx_admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view pbx_admin_users"
  ON public.pbx_admin_users FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  );

CREATE TRIGGER trg_pbx_admin_users_updated_at
  BEFORE UPDATE ON public.pbx_admin_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- voice_agent_conversations & transcripts (ElevenLabs mirror)
CREATE TABLE IF NOT EXISTS public.voice_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  voice_agent_id uuid REFERENCES public.lemtel_voice_agents(id) ON DELETE SET NULL,
  elevenlabs_agent_id text,
  conversation_id text NOT NULL,
  status text,
  caller_number text,
  callee_number text,
  duration_seconds integer,
  ended_reason text,
  audio_url text,
  has_audio boolean NOT NULL DEFAULT false,
  metadata jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, conversation_id)
);

GRANT SELECT ON public.voice_agent_conversations TO authenticated;
GRANT ALL ON public.voice_agent_conversations TO service_role;
ALTER TABLE public.voice_agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view voice_agent_conversations"
  ON public.voice_agent_conversations FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_view_org(auth.uid(), organization_id)
  );

CREATE TRIGGER trg_voice_agent_conversations_updated_at
  BEFORE UPDATE ON public.voice_agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_vac_org_started
  ON public.voice_agent_conversations(organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.voice_agent_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.voice_agent_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  speaker text,
  message text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  timestamp_seconds numeric,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voice_agent_transcripts TO authenticated;
GRANT ALL ON public.voice_agent_transcripts TO service_role;
ALTER TABLE public.voice_agent_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view voice_agent_transcripts"
  ON public.voice_agent_transcripts FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.can_view_org(auth.uid(), organization_id)
  );

CREATE INDEX IF NOT EXISTS idx_vat_conv_seq
  ON public.voice_agent_transcripts(conversation_id, sequence);

-- _real views (filter demo & historical)
CREATE OR REPLACE VIEW public.pbx_extensions_real AS
  SELECT * FROM public.pbx_extensions
  WHERE COALESCE(is_demo, false) = false
    AND COALESCE(source, 'fusionpbx') <> 'historical';

CREATE OR REPLACE VIEW public.pbx_devices_real AS
  SELECT * FROM public.pbx_devices
  WHERE COALESCE(is_demo, false) = false
    AND COALESCE(source, 'fusionpbx') <> 'historical';

CREATE OR REPLACE VIEW public.pbx_destinations_real AS
  SELECT * FROM public.pbx_destinations
  WHERE COALESCE(is_demo, false) = false
    AND COALESCE(source, 'fusionpbx') <> 'historical';

-- Phone numbers unified view: provider DID joined with PBX inbound destination
CREATE OR REPLACE VIEW public.phone_numbers_unified AS
  SELECT
    pn.id                            AS phone_number_id,
    pn.organization_id,
    pn.phone_number                  AS e164,
    pn.provider,
    pn.provider_sid,
    pn.friendly_name,
    pn.status                        AS provider_status,
    pn.capabilities,
    pn.recording_enabled,
    pn.is_demo                       AS phone_is_demo,
    d.id                             AS destination_id,
    d.pbx_uuid                       AS destination_pbx_uuid,
    d.destination_number,
    d.destination_type,
    d.destination_app,
    d.destination_action,
    d.enabled                        AS destination_enabled,
    d.is_demo                        AS destination_is_demo,
    CASE
      WHEN d.id IS NULL THEN 'unassigned'
      WHEN d.enabled IS FALSE THEN 'attached_disabled'
      ELSE 'attached'
    END                              AS link_status,
    pn.updated_at                    AS phone_updated_at,
    d.updated_at                     AS destination_updated_at
  FROM public.phone_numbers pn
  LEFT JOIN public.pbx_destinations d
    ON d.organization_id = pn.organization_id
   AND regexp_replace(COALESCE(d.destination_number, ''), '\D', '', 'g')
       = regexp_replace(COALESCE(pn.phone_number,    ''), '\D', '', 'g')
   AND regexp_replace(COALESCE(pn.phone_number, ''), '\D', '', 'g') <> '';

GRANT SELECT ON public.pbx_extensions_real TO authenticated;
GRANT SELECT ON public.pbx_devices_real TO authenticated;
GRANT SELECT ON public.pbx_destinations_real TO authenticated;
GRANT SELECT ON public.phone_numbers_unified TO authenticated;
