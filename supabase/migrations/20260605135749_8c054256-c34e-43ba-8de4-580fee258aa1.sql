
-- Revoke EXECUTE from anon (and PUBLIC) on SECURITY DEFINER helpers.
-- They are only needed for RLS evaluation (run as authenticated) or via service_role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_agent_access(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_organization_for_user(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_security_audit(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_agent_access(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_organization_for_user(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_security_audit(uuid) TO authenticated, service_role;

-- Add a caller-identity guard to run_security_audit (org_admin or super_admin only)
CREATE OR REPLACE FUNCTION public.run_security_audit(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  rls_topic boolean;
  rls_templates boolean;
  anon_topic_select boolean;
  anon_templates_select boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), _org_id, 'org_admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.relrowsecurity INTO rls_topic
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'topic_aggregates';

  SELECT c.relrowsecurity INTO rls_templates
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'prompt_templates';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='topic_aggregates'
      AND p.cmd='SELECT' AND 'anon' = ANY (p.roles)
  ) INTO anon_topic_select;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename='prompt_templates'
      AND p.cmd='SELECT' AND 'anon' = ANY (p.roles)
  ) INTO anon_templates_select;

  result := jsonb_build_object(
    'organization_id', _org_id,
    'checks', jsonb_build_array(
      jsonb_build_object('id','rls_topic_aggregates','title','RLS enabled on topic_aggregates','status', CASE WHEN coalesce(rls_topic,false) THEN 'pass' ELSE 'fail' END),
      jsonb_build_object('id','rls_prompt_templates','title','RLS enabled on prompt_templates','status', CASE WHEN coalesce(rls_templates,false) THEN 'pass' ELSE 'fail' END),
      jsonb_build_object('id','anon_select_topic_aggregates','title','No anonymous SELECT on topic_aggregates','status', CASE WHEN coalesce(anon_topic_select,false) THEN 'fail' ELSE 'pass' END),
      jsonb_build_object('id','anon_select_prompt_templates','title','No anonymous SELECT on prompt_templates','status', CASE WHEN coalesce(anon_templates_select,false) THEN 'fail' ELSE 'pass' END)
    )
  );
  RETURN result;
END;
$function$;
