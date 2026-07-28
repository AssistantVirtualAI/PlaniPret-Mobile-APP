
-- 1. Revoke sensitive columns from client roles
REVOKE SELECT (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;
REVOKE UPDATE (webhook_secret) ON public.agent_platform_webhooks FROM anon, authenticated;

REVOKE SELECT (key_hash) ON public.organization_api_keys FROM anon, authenticated;
REVOKE UPDATE (key_hash) ON public.organization_api_keys FROM anon, authenticated;

-- 2. Restrict conversations SELECT to privileged roles only
DROP POLICY IF EXISTS "Users can view organization conversations" ON public.conversations;
CREATE POLICY "Privileged roles can view organization conversations"
ON public.conversations
FOR SELECT
USING (
  ((organization_id IS NULL) AND (user_id = auth.uid()))
  OR (
    (organization_id IS NOT NULL) AND (
      has_role(auth.uid(), organization_id, 'agent'::app_role)
      OR has_role(auth.uid(), organization_id, 'manager'::app_role)
      OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
      OR is_super_admin(auth.uid())
    )
  )
);

-- 3. Restrict handoff_requests SELECT to privileged roles only
DROP POLICY IF EXISTS "Users can view organization handoff requests" ON public.handoff_requests;
CREATE POLICY "Privileged roles can view handoff requests"
ON public.handoff_requests
FOR SELECT
USING (
  has_role(auth.uid(), organization_id, 'agent'::app_role)
  OR has_role(auth.uid(), organization_id, 'manager'::app_role)
  OR has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  OR is_super_admin(auth.uid())
);
