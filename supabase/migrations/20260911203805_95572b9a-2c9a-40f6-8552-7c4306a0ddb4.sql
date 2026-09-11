DROP POLICY IF EXISTS "pp members read commission cache" ON public.planipret_commission_live_cache;

CREATE POLICY "pp admins read all commission cache"
ON public.planipret_commission_live_cache
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "pp brokers read own commission cache"
ON public.planipret_commission_live_cache
FOR SELECT
TO authenticated
USING (
  broker_user_id = auth.uid()
  OR maestro_broker_id IS NOT DISTINCT FROM (
    SELECT p.maestro_broker_id::text
    FROM public.planipret_profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
);