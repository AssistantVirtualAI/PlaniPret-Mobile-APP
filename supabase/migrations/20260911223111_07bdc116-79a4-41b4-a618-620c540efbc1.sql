DROP POLICY IF EXISTS "pp brokers read own commission cache" ON public.planipret_commission_live_cache;
CREATE POLICY "pp brokers read own commission cache"
ON public.planipret_commission_live_cache
FOR SELECT TO authenticated
USING (
  broker_user_id = auth.uid()
  OR (
    maestro_broker_id IS NOT NULL
    AND maestro_broker_id = (
      SELECT p.maestro_broker_id FROM public.planipret_profiles p
      WHERE p.user_id = auth.uid() AND p.maestro_broker_id IS NOT NULL
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "pp members read commission diag" ON public.planipret_commission_sync_diag;
CREATE POLICY "pp admins read commission diag"
ON public.planipret_commission_sync_diag
FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "pp brokers read own commission diag"
ON public.planipret_commission_sync_diag
FOR SELECT TO authenticated
USING (broker_user_id = auth.uid());

DROP POLICY IF EXISTS "pp members read commission runs" ON public.planipret_commission_sync_runs;
CREATE POLICY "pp admins read commission runs"
ON public.planipret_commission_sync_runs
FOR SELECT TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));