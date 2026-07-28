
CREATE TABLE public.lemtel_softphone_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  softphone_user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lemtel_invites_token ON public.lemtel_softphone_invites(token);
CREATE INDEX idx_lemtel_invites_softphone ON public.lemtel_softphone_invites(softphone_user_id);
CREATE INDEX idx_lemtel_invites_org ON public.lemtel_softphone_invites(organization_id);

GRANT SELECT ON public.lemtel_softphone_invites TO authenticated;
GRANT ALL ON public.lemtel_softphone_invites TO service_role;

ALTER TABLE public.lemtel_softphone_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lemtel admins can view invites"
  ON public.lemtel_softphone_invites FOR SELECT
  TO authenticated
  USING (
    public.is_lemtel_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  );

CREATE TRIGGER trg_lemtel_invites_updated_at
  BEFORE UPDATE ON public.lemtel_softphone_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
