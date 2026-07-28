CREATE OR REPLACE FUNCTION public.log_agent_access(_org_id uuid, _action text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  -- Verify caller belongs to the org being logged (prevents spoofing)
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid() AND organization_id = _org_id
  ) AND NOT public.is_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (organization_id, user_id, action, resource_type, metadata)
  VALUES (_org_id, auth.uid(), _action, 'agents', _metadata);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_agent_access(uuid, text, jsonb) TO authenticated;