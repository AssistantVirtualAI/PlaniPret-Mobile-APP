
-- 1) Cleanup pbx_extensions
DELETE FROM public.pbx_extensions WHERE extension IS NULL OR btrim(extension) = '';

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, extension
           ORDER BY COALESCE(synced_at, updated_at, created_at) DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM public.pbx_extensions
)
DELETE FROM public.pbx_extensions p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_extensions_org_ext_uniq
  ON public.pbx_extensions (organization_id, extension)
  WHERE extension IS NOT NULL AND btrim(extension) <> '';

-- 2) pbx_domain_users (FusionPBX "Users" page mirror)
CREATE TABLE IF NOT EXISTS public.pbx_domain_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pbx_uuid text,
  domain_uuid text,
  username text NOT NULL,
  email text,
  user_status text,
  user_enabled boolean DEFAULT true,
  api_key text,
  groups jsonb DEFAULT '[]'::jsonb,
  last_login_at timestamptz,
  sync_status text DEFAULT 'pending',
  last_synced_at timestamptz,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pbx_uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_domain_users TO authenticated;
GRANT ALL ON public.pbx_domain_users TO service_role;

ALTER TABLE public.pbx_domain_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lemtel_staff_select" ON public.pbx_domain_users
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_lemtel_admin(auth.uid()) OR public.is_lemtel_member(auth.uid()));

CREATE POLICY "org_members_select" ON public.pbx_domain_users
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())) OR public.is_super_admin(auth.uid()));

CREATE POLICY "org_admin_modify" ON public.pbx_domain_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER pbx_domain_users_set_updated_at
  BEFORE UPDATE ON public.pbx_domain_users
  FOR EACH ROW EXECUTE FUNCTION public.pbx_set_updated_at();

-- 3) Diagnostic helper
CREATE OR REPLACE FUNCTION public.audit_my_pbx_extensions_access(_org_id uuid DEFAULT '71755d33-ed64-4ad5-a828-61c9d2029eb7'::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _total int;
  _visible int;
  _last_sync timestamptz;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('error','not_authenticated'); END IF;
  SELECT email INTO _email FROM public.profiles WHERE id = _uid;
  SELECT count(*), max(COALESCE(last_synced_at, synced_at)) INTO _total, _last_sync
    FROM public.pbx_extensions WHERE organization_id = _org_id;
  SELECT count(*) INTO _visible
    FROM public.pbx_extensions WHERE organization_id = _org_id
      AND (
        public.is_super_admin(_uid) OR public.is_lemtel_admin(_uid) OR public.is_lemtel_member(_uid)
        OR organization_id IN (SELECT public.get_user_organization_ids(_uid))
      );
  RETURN jsonb_build_object(
    'user_id', _uid, 'email', _email,
    'is_super_admin', public.is_super_admin(_uid),
    'is_lemtel_admin', public.is_lemtel_admin(_uid),
    'is_lemtel_member', public.is_lemtel_member(_uid),
    'total_in_org', _total,
    'visible_to_me', _visible,
    'last_sync_at', _last_sync,
    'checked_at', now()
  );
END $$;
