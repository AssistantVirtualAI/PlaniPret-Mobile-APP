
-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.security_access_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  attempted_org_id uuid,
  user_org_ids uuid[],
  action text NOT NULL,
  resource text,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.security_access_violations TO authenticated;
GRANT ALL ON public.security_access_violations TO service_role;
ALTER TABLE public.security_access_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins read violations" ON public.security_access_violations;
CREATE POLICY "super_admins read violations" ON public.security_access_violations
FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "service inserts violations" ON public.security_access_violations;
CREATE POLICY "service inserts violations" ON public.security_access_violations
FOR INSERT WITH CHECK (false); -- only via SECURITY DEFINER functions

CREATE INDEX IF NOT EXISTS idx_sav_org ON public.security_access_violations(attempted_org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sav_user ON public.security_access_violations(user_id, occurred_at DESC);

-- 2) Logger
CREATE OR REPLACE FUNCTION public.log_access_violation(
  _target_org uuid,
  _action text,
  _resource text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _email text; _orgs uuid[];
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  SELECT coalesce(array_agg(o),'{}') INTO _orgs FROM public.get_user_organization_ids(auth.uid()) o;
  INSERT INTO public.security_access_violations
    (user_id, user_email, attempted_org_id, user_org_ids, action, resource, metadata)
  VALUES (auth.uid(), _email, _target_org, _orgs, _action, _resource, coalesce(_metadata,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.log_access_violation(uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_access_violation(uuid,text,text,jsonb) TO authenticated, service_role;

-- 3) Assert helper: throws + logs when forbidden
CREATE OR REPLACE FUNCTION public.assert_org_access(
  _target_org uuid,
  _action text DEFAULT 'access',
  _resource text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  IF _target_org = ANY (ARRAY(SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RETURN;
  END IF;
  PERFORM public.log_access_violation(_target_org, _action, _resource,
    jsonb_build_object('blocked', true));
  RAISE EXCEPTION 'forbidden_cross_org_access target=%', _target_org USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION public.assert_org_access(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_org_access(uuid,text,text) TO authenticated, service_role;

-- 4) Automated isolation verifier (super_admin only)
CREATE OR REPLACE FUNCTION public.verify_org_isolation()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _violations jsonb := '[]'::jsonb;
  _checked int := 0;
  _u record; _o record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _u IN
    SELECT p.id, p.email
    FROM public.profiles p
    WHERE NOT public.is_super_admin(p.id)
  LOOP
    FOR _o IN SELECT id, name FROM public.organizations LOOP
      _checked := _checked + 1;
      IF public.can_access_org(_u.id, _o.id)
         AND _o.id <> ALL (ARRAY(SELECT public.get_user_organization_ids(_u.id))) THEN
        _violations := _violations || jsonb_build_object(
          'user_id', _u.id, 'user_email', _u.email,
          'leaked_org_id', _o.id, 'leaked_org_name', _o.name
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'pairs_checked', _checked,
    'leak_count', jsonb_array_length(_violations),
    'isolation_ok', jsonb_array_length(_violations) = 0,
    'violations', _violations
  );
END $$;

REVOKE ALL ON FUNCTION public.verify_org_isolation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_org_isolation() TO authenticated, service_role;
