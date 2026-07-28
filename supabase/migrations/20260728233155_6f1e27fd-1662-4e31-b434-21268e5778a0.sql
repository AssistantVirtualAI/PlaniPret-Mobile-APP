GRANT SELECT ON public.planipret_maestro_sync_log TO authenticated;
GRANT ALL ON public.planipret_maestro_sync_log TO service_role;

DROP POLICY IF EXISTS "sync_log_select_own" ON public.planipret_maestro_sync_log;
CREATE POLICY "sync_log_select_own"
ON public.planipret_maestro_sync_log
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()));