
-- Per-platform app access on softphone users
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS desktop_access_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_access_enabled  boolean NOT NULL DEFAULT true;

-- AI insight enrichment on recordings
ALTER TABLE public.pbx_call_recordings
  ADD COLUMN IF NOT EXISTS topics jsonb,
  ADD COLUMN IF NOT EXISTS action_items jsonb;

-- Realtime publication for live admin pages
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pbx_extensions';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_extensions'; END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pbx_softphone_users';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_softphone_users'; END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pbx_call_recordings';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_recordings'; END IF;
END $$;

-- Per-platform access helper used by app login flow
CREATE OR REPLACE FUNCTION public.set_softphone_platform_access(
  _softphone_id uuid, _desktop boolean, _mobile boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.pbx_softphone_users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.pbx_softphone_users WHERE id=_softphone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'softphone user not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
       OR public.is_lemtel_admin(auth.uid())
       OR public.has_role(auth.uid(), _row.organization_id, 'org_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.pbx_softphone_users
     SET desktop_access_enabled = _desktop,
         mobile_access_enabled  = _mobile,
         app_access_enabled     = (_desktop OR _mobile),
         updated_at = now()
   WHERE id = _softphone_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (_row.organization_id, auth.uid(), 'softphone_access_changed', 'pbx_softphone_users', _softphone_id,
          jsonb_build_object('desktop', _desktop, 'mobile', _mobile, 'extension', _row.extension));

  RETURN jsonb_build_object('ok', true, 'desktop_access_enabled', _desktop, 'mobile_access_enabled', _mobile);
END $$;
