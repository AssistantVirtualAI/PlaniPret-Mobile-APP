
-- Custom Tags table
CREATE TABLE public.custom_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  icon text DEFAULT 'tag',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE public.custom_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view custom tags" ON public.custom_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = custom_tags.organization_id
    AND organization_members.user_id = auth.uid()
  ));

CREATE POLICY "Managers can manage custom tags" ON public.custom_tags
  FOR ALL USING (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  ) WITH CHECK (
    has_role(auth.uid(), organization_id, 'manager'::app_role)
    OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
    OR is_super_admin(auth.uid())
  );

-- Conversation Tags junction table
CREATE TABLE public.conversation_tags (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.custom_tags(id) ON DELETE CASCADE,
  tagged_by uuid,
  tagged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view conversation tags" ON public.conversation_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = conversation_tags.conversation_id
    AND om.user_id = auth.uid()
  ));

CREATE POLICY "Agents can manage conversation tags" ON public.conversation_tags
  FOR ALL USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_tags.conversation_id
    AND (c.user_id = auth.uid() OR (c.organization_id IS NOT NULL AND (
      has_role(auth.uid(), c.organization_id, 'agent'::app_role)
      OR has_role(auth.uid(), c.organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), c.organization_id, 'org_admin'::app_role)
      OR is_super_admin(auth.uid())
    )))
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_tags.conversation_id
    AND (c.user_id = auth.uid() OR (c.organization_id IS NOT NULL AND (
      has_role(auth.uid(), c.organization_id, 'agent'::app_role)
      OR has_role(auth.uid(), c.organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), c.organization_id, 'org_admin'::app_role)
      OR is_super_admin(auth.uid())
    )))
  ));
