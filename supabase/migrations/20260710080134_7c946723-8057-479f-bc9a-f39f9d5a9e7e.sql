CREATE TABLE IF NOT EXISTS public.planipret_did_assignments (
  phone_number_e164 text PRIMARY KEY,
  phone_number_digits text NOT NULL,
  extension text NOT NULL,
  callerid_name text,
  domain text NOT NULL DEFAULT 'planipret.ca',
  source text NOT NULL DEFAULT 'csv_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_planipret_did_assign_ext ON public.planipret_did_assignments(extension);
CREATE INDEX IF NOT EXISTS idx_planipret_did_assign_digits ON public.planipret_did_assignments(phone_number_digits);
GRANT SELECT ON public.planipret_did_assignments TO authenticated;
GRANT ALL ON public.planipret_did_assignments TO service_role;
ALTER TABLE public.planipret_did_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Planipret admins read DID assignments" ON public.planipret_did_assignments;
CREATE POLICY "Planipret admins read DID assignments"
  ON public.planipret_did_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );