CREATE POLICY "commission_imports_admin_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'commission-imports' AND (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid())))
  WITH CHECK (bucket_id = 'commission-imports' AND (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid())));