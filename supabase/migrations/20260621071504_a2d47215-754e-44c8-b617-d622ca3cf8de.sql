
DROP POLICY IF EXISTS "queue_agents_select_v2" ON public.pbx_queue_agents;
CREATE POLICY "queue_agents_select_v2" ON public.pbx_queue_agents FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR (organization_id IS NOT NULL AND organization_id IN (SELECT get_user_organization_ids(auth.uid())))
  OR (queue_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM pbx_call_queues q
    WHERE q.id = pbx_queue_agents.queue_id
      AND q.organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  ))
);

DROP POLICY IF EXISTS "queue_agents_modify_v2" ON public.pbx_queue_agents;
CREATE POLICY "queue_agents_modify_v2" ON public.pbx_queue_agents FOR ALL
USING (
  is_super_admin(auth.uid())
  OR (organization_id IS NOT NULL AND has_role(auth.uid(), organization_id, 'org_admin'::app_role))
  OR (queue_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM pbx_call_queues q
    WHERE q.id = pbx_queue_agents.queue_id
      AND has_role(auth.uid(), q.organization_id, 'org_admin'::app_role)
  ))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (organization_id IS NOT NULL AND has_role(auth.uid(), organization_id, 'org_admin'::app_role))
);

DROP POLICY IF EXISTS "queue_rec_rules_select" ON public.pbx_queue_recording_rules;
CREATE POLICY "queue_rec_rules_select" ON public.pbx_queue_recording_rules FOR SELECT
USING (is_super_admin(auth.uid()) OR organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "queue_rec_rules_modify" ON public.pbx_queue_recording_rules;
CREATE POLICY "queue_rec_rules_modify" ON public.pbx_queue_recording_rules FOR ALL
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role))
WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), organization_id, 'org_admin'::app_role));

DROP POLICY IF EXISTS "super admins view sip profiles" ON public.pbx_sip_profiles;
CREATE POLICY "super admins view sip profiles" ON public.pbx_sip_profiles FOR SELECT
USING (is_super_admin(auth.uid()));
