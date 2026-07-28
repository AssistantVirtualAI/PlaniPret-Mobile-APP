
-- unique index on fusionpbx_domain_uuid (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS organizations_fpbx_domain_uuid_uniq
  ON public.organizations (fusionpbx_domain_uuid)
  WHERE fusionpbx_domain_uuid IS NOT NULL;

-- index for domain-name lookups used by the public portal route
CREATE INDEX IF NOT EXISTS organizations_fpbx_domain_name_idx
  ON public.organizations (fusionpbx_domain_name);

-- RPC: create a tenant org for a freshly created PBX domain
CREATE OR REPLACE FUNCTION public.setup_customer_organization(
  _name text,
  _slug text,
  _domain_uuid text,
  _domain_name text,
  _admin_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _org_id uuid;
  _final_slug text;
  _counter int := 0;
  _trial_ends timestamptz;
  _admin_uid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.is_super_admin(_uid) OR public.is_lemtel_admin(_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- existing org?
  SELECT id INTO _org_id FROM public.organizations
   WHERE fusionpbx_domain_uuid = _domain_uuid LIMIT 1;
  IF _org_id IS NOT NULL THEN RETURN _org_id; END IF;

  -- unique slug
  _final_slug := lower(regexp_replace(coalesce(_slug, _name), '[^a-z0-9]+', '-', 'g'));
  _final_slug := trim(both '-' from _final_slug);
  IF _final_slug = '' THEN _final_slug := 'customer'; END IF;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = _final_slug) LOOP
    _counter := _counter + 1;
    _final_slug := _final_slug || '-' || _counter::text;
  END LOOP;

  INSERT INTO public.organizations
    (name, slug, fusionpbx_domain_uuid, fusionpbx_domain_name, onboarding_completed, is_active, is_internal)
  VALUES
    (_name, _final_slug, _domain_uuid, _domain_name, true, true, false)
  RETURNING id INTO _org_id;

  -- 14-day trial billing
  _trial_ends := now() + interval '14 days';
  INSERT INTO public.billing_config (organization_id, plan_tier, trial_ends_at, subscription_status)
  VALUES (_org_id, 'free', _trial_ends, 'trialing')
  ON CONFLICT (organization_id) DO NOTHING;

  -- optionally link an existing user as org_admin
  IF _admin_email IS NOT NULL AND _admin_email <> '' THEN
    SELECT id INTO _admin_uid FROM public.profiles WHERE lower(email) = lower(_admin_email) LIMIT 1;
    IF _admin_uid IS NOT NULL THEN
      INSERT INTO public.organization_members (user_id, organization_id, accepted_at)
      VALUES (_admin_uid, _org_id, now())
      ON CONFLICT DO NOTHING;
      INSERT INTO public.user_roles (user_id, organization_id, role)
      VALUES (_admin_uid, _org_id, 'org_admin')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN _org_id;
END;
$$;

-- public lookup: domain-name → minimal org info (used by /c/:domain)
CREATE OR REPLACE FUNCTION public.resolve_org_by_domain_name(_domain_name text)
RETURNS TABLE(id uuid, name text, slug text, fusionpbx_domain_uuid text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.fusionpbx_domain_uuid
  FROM public.organizations o
  WHERE lower(o.fusionpbx_domain_name) = lower(_domain_name)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.setup_customer_organization(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_org_by_domain_name(text) TO anon, authenticated;
