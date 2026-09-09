CREATE POLICY "admins read all tasks projection"
ON public.planipret_tasks_projection
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));