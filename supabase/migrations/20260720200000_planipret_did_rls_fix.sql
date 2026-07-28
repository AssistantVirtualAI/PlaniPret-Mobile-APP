-- Correction RLS planipret_did_assignments
-- Permettre à chaque courtier de lire son propre DID (par extension + domain)
-- La politique admin existante reste en place pour la gestion complète

-- Supprimer l'ancienne politique restrictive (admins only)
DROP POLICY IF EXISTS "Planipret admins read DID assignments" ON public.planipret_did_assignments;

-- Nouvelle politique : chaque courtier peut lire les DIDs assignés à son extension
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

-- Politique admin séparée pour la gestion complète
CREATE POLICY "Planipret admins manage DID assignments"
  ON public.planipret_did_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );
