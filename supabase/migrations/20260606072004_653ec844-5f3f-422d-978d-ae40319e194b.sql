DROP POLICY IF EXISTS "Privileged roles can view organization conversations" ON public.conversations;
DROP POLICY IF EXISTS "Managers can update organization conversations" ON public.conversations;
DROP POLICY IF EXISTS "Managers can delete organization conversations" ON public.conversations;

CREATE POLICY "Org roles can view organization conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR
  (
    organization_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), organization_id, 'agent'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'manager'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'super_admin'::public.app_role)
    )
  )
);

CREATE POLICY "Org managers can update organization conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR
  (
    organization_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), organization_id, 'manager'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'super_admin'::public.app_role)
    )
  )
)
WITH CHECK (
  (organization_id IS NULL AND user_id = auth.uid())
  OR
  (
    organization_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), organization_id, 'manager'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'super_admin'::public.app_role)
    )
  )
);

CREATE POLICY "Org managers can delete organization conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (
  (organization_id IS NULL AND user_id = auth.uid())
  OR
  (
    organization_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), organization_id, 'manager'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'org_admin'::public.app_role)
      OR public.has_role(auth.uid(), organization_id, 'super_admin'::public.app_role)
    )
  )
);