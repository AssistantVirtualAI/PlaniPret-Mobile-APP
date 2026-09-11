DROP POLICY IF EXISTS "pp admins read all contracts" ON public.planipret_contracts;
CREATE POLICY "pp admins read all contracts"
ON public.planipret_contracts FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()));