CREATE OR REPLACE FUNCTION public.guard_planipret_admin_org_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := COALESCE(NEW.user_id, NULL);
  _org uuid;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'organization_members' THEN
    _org := NEW.organization_id;
  ELSIF TG_TABLE_NAME = 'org_members' THEN
    _org := NEW.org_id;
  ELSE
    RETURN NEW;
  END IF;

  IF _org = '17d6507f-a9ca-409d-8e49-371d50332615'::uuid THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin(_uid) THEN RETURN NEW; END IF;
  IF public.is_planipret_admin(_uid) THEN
    RAISE EXCEPTION 'Planipret admins are restricted to the Planipret organization and cannot be added to org %', _org
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_planipret_scope_om ON public.organization_members;
CREATE TRIGGER trg_guard_planipret_scope_om
BEFORE INSERT OR UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.guard_planipret_admin_org_scope();

DROP TRIGGER IF EXISTS trg_guard_planipret_scope_om2 ON public.org_members;
CREATE TRIGGER trg_guard_planipret_scope_om2
BEFORE INSERT OR UPDATE ON public.org_members
FOR EACH ROW EXECUTE FUNCTION public.guard_planipret_admin_org_scope();