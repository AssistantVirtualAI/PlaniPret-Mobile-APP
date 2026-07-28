
-- 1) Audit log table for portal_user_id mapping changes
CREATE TABLE IF NOT EXISTS public.pbx_softphone_portal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  softphone_user_id uuid NOT NULL REFERENCES public.pbx_softphone_users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  extension text NOT NULL,
  old_portal_user_id uuid,
  new_portal_user_id uuid,
  action text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pbx_softphone_portal_audit TO authenticated;
GRANT ALL ON public.pbx_softphone_portal_audit TO service_role;

ALTER TABLE public.pbx_softphone_portal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admin_or_super_select_audit"
  ON public.pbx_softphone_portal_audit FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS pbx_softphone_portal_audit_org_idx
  ON public.pbx_softphone_portal_audit(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pbx_softphone_portal_audit_sp_idx
  ON public.pbx_softphone_portal_audit(softphone_user_id, created_at DESC);

-- 2) Trigger: log portal_user_id mapping creation/changes
CREATE OR REPLACE FUNCTION public.log_pbx_softphone_portal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_email text;
  _action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.portal_user_id IS NULL THEN RETURN NEW; END IF;
    _action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.portal_user_id IS NOT DISTINCT FROM OLD.portal_user_id THEN RETURN NEW; END IF;
    IF OLD.portal_user_id IS NULL AND NEW.portal_user_id IS NOT NULL THEN _action := 'linked';
    ELSIF OLD.portal_user_id IS NOT NULL AND NEW.portal_user_id IS NULL THEN _action := 'unlinked';
    ELSE _action := 'changed';
    END IF;
  ELSE RETURN NEW;
  END IF;

  SELECT email INTO _actor_email FROM public.profiles WHERE id = _actor;

  INSERT INTO public.pbx_softphone_portal_audit (
    softphone_user_id, organization_id, extension,
    old_portal_user_id, new_portal_user_id,
    action, actor_user_id, actor_email, source
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.extension,
    CASE WHEN TG_OP='UPDATE' THEN OLD.portal_user_id END,
    NEW.portal_user_id,
    _action, _actor, _actor_email,
    COALESCE(current_setting('app.audit_source', true), 'sql')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pbx_softphone_portal_audit ON public.pbx_softphone_users;
CREATE TRIGGER trg_pbx_softphone_portal_audit
  AFTER INSERT OR UPDATE OF portal_user_id ON public.pbx_softphone_users
  FOR EACH ROW EXECUTE FUNCTION public.log_pbx_softphone_portal_change();

-- 3) Auto-link fallback when portal_user_id is null
-- Tries: explicit email field unavailable, so match by extension's display_name email pattern,
--   then by extension-as-local-part of any profile email, respecting SIP domain rules
CREATE OR REPLACE FUNCTION public.autolink_softphone_portal_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _matched uuid;
  _email_candidate text;
  _domain text;
BEGIN
  IF NEW.portal_user_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Candidate 1: display_name contains a full email
  IF NEW.display_name ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
    _email_candidate := lower(substring(NEW.display_name from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'));
    SELECT id INTO _matched FROM public.profiles WHERE lower(email) = _email_candidate LIMIT 1;
  END IF;

  -- Candidate 2: profile email local-part equals extension AND email domain matches sip_domain rule
  IF _matched IS NULL THEN
    _domain := lower(coalesce(NEW.sip_domain, ''));
    -- strip subdomain prefix like "lemtel.lemtel.tel" -> "lemtel.tel"
    IF _domain LIKE '%.%.%' THEN
      _domain := substring(_domain from position('.' in _domain) + 1);
    END IF;
    SELECT id INTO _matched FROM public.profiles
      WHERE lower(split_part(email,'@',1)) = lower(NEW.extension)
        AND (_domain = '' OR lower(split_part(email,'@',2)) = _domain)
      LIMIT 1;
  END IF;

  IF _matched IS NOT NULL THEN
    NEW.portal_user_id := _matched;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pbx_softphone_autolink ON public.pbx_softphone_users;
CREATE TRIGGER trg_pbx_softphone_autolink
  BEFORE INSERT OR UPDATE OF portal_user_id, display_name, sip_domain, extension
  ON public.pbx_softphone_users
  FOR EACH ROW EXECUTE FUNCTION public.autolink_softphone_portal_user();

-- 4) Admin RPCs: list candidates + manually link by email with validation
CREATE OR REPLACE FUNCTION public.admin_link_softphone_by_email(_softphone_id uuid, _email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.pbx_softphone_users%ROWTYPE;
  _uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id = _softphone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'softphone user not found'; END IF;
  IF NOT (public.has_role(auth.uid(), _row.organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _email IS NULL OR _email = '' THEN
    UPDATE public.pbx_softphone_users SET portal_user_id = NULL, updated_at = now() WHERE id = _softphone_id;
    RETURN jsonb_build_object('ok', true, 'portal_user_id', null);
  END IF;

  SELECT id INTO _uid FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'no auth user found for email %', _email;
  END IF;

  UPDATE public.pbx_softphone_users
    SET portal_user_id = _uid, updated_at = now()
    WHERE id = _softphone_id;

  RETURN jsonb_build_object('ok', true, 'portal_user_id', _uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_link_softphone_by_email(uuid, text) TO authenticated;

-- 5) Verification view: status of every extension's portal_user_id link
CREATE OR REPLACE VIEW public.pbx_softphone_link_status AS
SELECT
  s.id,
  s.organization_id,
  s.extension,
  s.display_name,
  s.sip_domain,
  s.portal_user_id,
  p.email AS portal_email,
  p.full_name AS portal_full_name,
  CASE
    WHEN s.portal_user_id IS NULL THEN 'unlinked'
    WHEN p.id IS NULL THEN 'mismatched'
    ELSE 'ok'
  END AS link_status
FROM public.pbx_softphone_users s
LEFT JOIN public.profiles p ON p.id = s.portal_user_id;

GRANT SELECT ON public.pbx_softphone_link_status TO authenticated;
