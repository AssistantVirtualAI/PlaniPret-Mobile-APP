DROP POLICY IF EXISTS "pp brokers read own contracts" ON public.planipret_contracts;
CREATE POLICY "pp brokers read own contracts"
ON public.planipret_contracts FOR SELECT TO authenticated
USING (
  broker_profile_id = auth.uid()
  OR broker_profile_id IN (SELECT p.id FROM public.planipret_profiles p WHERE p.user_id = auth.uid())
);