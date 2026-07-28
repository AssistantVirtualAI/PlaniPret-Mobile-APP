DROP POLICY IF EXISTS "Planipret admins read DID assignments" ON public.planipret_did_assignments;

CREATE POLICY "Planipret brokers read own DID assignments"
  ON public.planipret_did_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid()
        AND p.extension = planipret_did_assignments.extension
        AND p.ns_domain = planipret_did_assignments.domain
    )
  );

CREATE POLICY "Planipret admins manage DID assignments"
  ON public.planipret_did_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );