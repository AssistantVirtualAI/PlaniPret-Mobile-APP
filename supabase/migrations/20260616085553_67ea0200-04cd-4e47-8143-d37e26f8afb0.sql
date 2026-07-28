
-- 1. Helper: who is allowed to grant app access
CREATE OR REPLACE FUNCTION public.lemtel_can_grant_app_access(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_uid) OR public.is_lemtel_admin(_uid)
$$;

-- 2. Lemtel-only mutators
CREATE OR REPLACE FUNCTION public.set_softphone_app_access(_softphone_id uuid, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row public.pbx_softphone_users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id=_softphone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'softphone user not found'; END IF;
  IF NOT public.lemtel_can_grant_app_access(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: only Lemtel admins may grant app access';
  END IF;
  UPDATE public.pbx_softphone_users
     SET app_access_enabled=_enabled, updated_at=now()
   WHERE id=_softphone_id;
  INSERT INTO public.audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (_row.organization_id, auth.uid(), 'softphone_app_access_changed', 'pbx_softphone_users', _softphone_id,
          jsonb_build_object('enabled', _enabled, 'extension', _row.extension));
  RETURN jsonb_build_object('ok', true, 'app_access_enabled', _enabled);
END $fn$;

CREATE OR REPLACE FUNCTION public.set_softphone_platform_access(_softphone_id uuid, _desktop boolean, _mobile boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row public.pbx_softphone_users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id=_softphone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'softphone user not found'; END IF;
  IF NOT public.lemtel_can_grant_app_access(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: only Lemtel admins may grant app access';
  END IF;
  UPDATE public.pbx_softphone_users
     SET desktop_access_enabled=_desktop,
         mobile_access_enabled=_mobile,
         app_access_enabled=(_desktop OR _mobile),
         updated_at=now()
   WHERE id=_softphone_id;
  INSERT INTO public.audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (_row.organization_id, auth.uid(), 'softphone_app_access_changed', 'pbx_softphone_users', _softphone_id,
          jsonb_build_object('desktop', _desktop, 'mobile', _mobile, 'extension', _row.extension));
  RETURN jsonb_build_object('ok', true, 'desktop_access_enabled', _desktop, 'mobile_access_enabled', _mobile);
END $fn$;

-- 3. Default-deny on new softphone rows
ALTER TABLE public.pbx_softphone_users ALTER COLUMN app_access_enabled SET DEFAULT false;
ALTER TABLE public.pbx_softphone_users ALTER COLUMN desktop_access_enabled SET DEFAULT false;
ALTER TABLE public.pbx_softphone_users ALTER COLUMN mobile_access_enabled SET DEFAULT false;

-- 4. Provisioning queue (rows the edge function picks up to create auth users)
CREATE TABLE IF NOT EXISTS public.pbx_app_provision_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  softphone_id uuid NOT NULL REFERENCES public.pbx_softphone_users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  extension text NOT NULL,
  sip_domain text,
  sip_password text,
  display_name text,
  status text NOT NULL DEFAULT 'pending',  -- pending | done | error
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

GRANT SELECT ON public.pbx_app_provision_queue TO authenticated;
GRANT ALL ON public.pbx_app_provision_queue TO service_role;

ALTER TABLE public.pbx_app_provision_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lemtel admins can view provision queue"
ON public.pbx_app_provision_queue FOR SELECT TO authenticated
USING (public.lemtel_can_grant_app_access(auth.uid()));

-- 5. Trigger: every new pbx_softphone_users row enqueues a provisioning job
CREATE OR REPLACE FUNCTION public.enqueue_app_user_provision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.pbx_app_provision_queue
    (softphone_id, organization_id, extension, sip_domain, sip_password, display_name)
  VALUES
    (NEW.id, NEW.organization_id, NEW.extension, NEW.sip_domain,
     COALESCE(NEW.sip_password, NULL), NEW.display_name);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_enqueue_app_user_provision ON public.pbx_softphone_users;
CREATE TRIGGER trg_enqueue_app_user_provision
AFTER INSERT ON public.pbx_softphone_users
FOR EACH ROW EXECUTE FUNCTION public.enqueue_app_user_provision();

-- 6. Update queue when SIP password rotates so the edge function can re-sync
CREATE OR REPLACE FUNCTION public.enqueue_app_user_password_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.sip_password IS DISTINCT FROM OLD.sip_password AND NEW.sip_password IS NOT NULL THEN
    INSERT INTO public.pbx_app_provision_queue
      (softphone_id, organization_id, extension, sip_domain, sip_password, display_name)
    VALUES
      (NEW.id, NEW.organization_id, NEW.extension, NEW.sip_domain, NEW.sip_password, NEW.display_name);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_enqueue_app_user_password_sync ON public.pbx_softphone_users;
CREATE TRIGGER trg_enqueue_app_user_password_sync
AFTER UPDATE ON public.pbx_softphone_users
FOR EACH ROW EXECUTE FUNCTION public.enqueue_app_user_password_sync();
