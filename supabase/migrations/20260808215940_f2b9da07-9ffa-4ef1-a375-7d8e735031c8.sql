DROP POLICY IF EXISTS "Brokers read their own recording upload records" ON public.planipret_recording_uploads;
CREATE POLICY "Brokers read their own recording upload records"
ON public.planipret_recording_uploads FOR SELECT TO authenticated
USING (user_id IN (SELECT public.planipret_broker_ids(auth.uid())) OR public.is_planipret_admin(auth.uid()));