-- Security audit runs + basic backend checks

CREATE TABLE IF NOT EXISTS public.security_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  run_by uuid NOT NULL,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_runs ENABLE ROW LEVEL SECURITY;

-- Only org admins/managers (and super admins) can view audit runs for their org
CREATE POLICY "Admins can view security audit runs"
ON public.security_audit_runs
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

-- Only backend/system should insert audit runs
CREATE POLICY "System can insert security audit runs"
ON public.security_audit_runs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Basic check function (no raw SQL execution in edge functions; use RPC)
CREATE OR REPLACE FUNCTION public.run_security_audit(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  rls_topic boolean;
  rls_templates boolean;
  anon_topic_select boolean;
  anon_templates_select boolean;
BEGIN
  -- RLS enabled?
  SELECT c.relrowsecurity
    INTO rls_topic
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'topic_aggregates';

  SELECT c.relrowsecurity
    INTO rls_templates
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'prompt_templates';

  -- Any anon SELECT policy? (should be false)
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'topic_aggregates'
      AND p.cmd = 'SELECT'
      AND 'anon' = ANY (p.roles)
  ) INTO anon_topic_select;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'prompt_templates'
      AND p.cmd = 'SELECT'
      AND 'anon' = ANY (p.roles)
  ) INTO anon_templates_select;

  result := jsonb_build_object(
    'organization_id', _org_id,
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'rls_topic_aggregates',
        'title', 'RLS enabled on topic_aggregates',
        'status', CASE WHEN coalesce(rls_topic, false) THEN 'pass' ELSE 'fail' END
      ),
      jsonb_build_object(
        'id', 'rls_prompt_templates',
        'title', 'RLS enabled on prompt_templates',
        'status', CASE WHEN coalesce(rls_templates, false) THEN 'pass' ELSE 'fail' END
      ),
      jsonb_build_object(
        'id', 'anon_select_topic_aggregates',
        'title', 'No anonymous SELECT on topic_aggregates',
        'status', CASE WHEN coalesce(anon_topic_select, false) THEN 'fail' ELSE 'pass' END
      ),
      jsonb_build_object(
        'id', 'anon_select_prompt_templates',
        'title', 'No anonymous SELECT on prompt_templates',
        'status', CASE WHEN coalesce(anon_templates_select, false) THEN 'fail' ELSE 'pass' END
      )
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_security_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_security_audit(uuid) TO authenticated;
