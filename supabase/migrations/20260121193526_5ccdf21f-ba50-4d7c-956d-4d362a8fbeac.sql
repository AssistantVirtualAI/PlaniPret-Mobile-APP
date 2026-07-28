-- Fix warn-level public exposure by scoping permissive policies to service_role only

-- topic_aggregates
ALTER TABLE public.topic_aggregates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'topic_aggregates'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.topic_aggregates', r.policyname);
  END LOOP;
END $$;

-- Service-only manage policy
CREATE POLICY "System can manage topic aggregates"
ON public.topic_aggregates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated org members can read
CREATE POLICY "Users can view organization topic aggregates"
ON public.topic_aggregates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = topic_aggregates.organization_id
      AND om.user_id = auth.uid()
  )
);


-- prompt_templates
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prompt_templates'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.prompt_templates', r.policyname);
  END LOOP;
END $$;

-- Read: org members can read their org templates; any authenticated user can read global defaults
CREATE POLICY "Prompt templates readable by authenticated"
ON public.prompt_templates
FOR SELECT
TO authenticated
USING (
  (organization_id IS NULL AND is_default = true)
  OR
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = prompt_templates.organization_id
      AND om.user_id = auth.uid()
  )
);

-- Write: only managers/admins/super admins can manage org templates, and cannot set is_default
CREATE POLICY "Admins can create org prompt templates"
ON public.prompt_templates
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND is_default = false
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Admins can update org prompt templates"
ON public.prompt_templates
FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND is_default = false
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Admins can delete org prompt templates"
ON public.prompt_templates
FOR DELETE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);
