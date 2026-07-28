CREATE TABLE IF NOT EXISTS public.lemtel_softphone_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,
  softphone_user_id uuid NOT NULL REFERENCES public.pbx_softphone_users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  email           text NOT NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at     timestamptz,
  last_viewed_at  timestamptz,
  view_count      integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lemtel_softphone_invites TO service_role;
GRANT SELECT ON public.lemtel_softphone_invites TO authenticated;
REVOKE SELECT (token) ON public.lemtel_softphone_invites FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_lemtel_invites_token ON public.lemtel_softphone_invites(token);
CREATE INDEX IF NOT EXISTS idx_lemtel_invites_softphone ON public.lemtel_softphone_invites(softphone_user_id);
CREATE INDEX IF NOT EXISTS idx_lemtel_invites_org ON public.lemtel_softphone_invites(organization_id);

ALTER TABLE public.lemtel_softphone_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lemtel_invites_member_view"
    ON public.lemtel_softphone_invites
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.organization_id = lemtel_softphone_invites.organization_id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tg_lemtel_invites_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_lemtel_invites_touch ON public.lemtel_softphone_invites;
CREATE TRIGGER trg_lemtel_invites_touch
  BEFORE UPDATE ON public.lemtel_softphone_invites
  FOR EACH ROW EXECUTE FUNCTION public.tg_lemtel_invites_touch();