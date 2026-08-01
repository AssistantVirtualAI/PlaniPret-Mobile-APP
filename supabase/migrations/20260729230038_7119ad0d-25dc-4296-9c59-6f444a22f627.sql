ALTER PUBLICATION supabase_realtime DROP TABLE public.planipret_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_profiles (
  id, user_id, organization_id, full_name, email, phone, extension, role,
  status, mobile_app_enabled, voice_agent_enabled, language, avatar_url,
  onboarding_completed, onboarding_step, ns_linked, maestro_connected,
  ms365_email, updated_at, created_at
);

CREATE POLICY "admins update voice_agent_assignments"
ON public.voice_agent_assignments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR has_role(auth.uid(), organization_id, 'manager'::app_role) OR is_super_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), organization_id, 'org_admin'::app_role) OR has_role(auth.uid(), organization_id, 'manager'::app_role) OR is_super_admin(auth.uid()));