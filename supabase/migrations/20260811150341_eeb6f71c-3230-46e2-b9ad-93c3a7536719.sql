ALTER TABLE public.planipret_did_assignments
  ALTER COLUMN extension DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.planipret_did_assignments
  DROP CONSTRAINT IF EXISTS planipret_did_assignments_status_chk;
ALTER TABLE public.planipret_did_assignments
  ADD CONSTRAINT planipret_did_assignments_status_chk CHECK (status IN ('assigned','available','reserved'));

CREATE INDEX IF NOT EXISTS idx_planipret_did_assign_status ON public.planipret_did_assignments(status);

-- Libère tous les numéros dont le poste n'est rattaché à aucun profil courtier réel
UPDATE public.planipret_did_assignments d
SET status = 'available',
    extension = NULL,
    callerid_name = NULL,
    display_name = NULL,
    updated_at = now()
WHERE d.extension IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.planipret_profiles p
    WHERE p.extension = d.extension
  );

-- Renseigne le nom affiché pour les numéros réellement assignés
UPDATE public.planipret_did_assignments d
SET display_name = p.full_name,
    status = 'assigned',
    updated_at = now()
FROM public.planipret_profiles p
WHERE p.extension = d.extension
  AND d.extension IS NOT NULL;