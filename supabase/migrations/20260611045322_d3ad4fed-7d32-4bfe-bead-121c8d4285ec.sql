-- Allow lemtel admins / super admins to manage clients
DROP POLICY IF EXISTS "Org admins can insert clients" ON public.clients;
CREATE POLICY "Org admins can insert clients" ON public.clients
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.organization_id = clients.organization_id AND user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['org_admin'::app_role,'super_admin'::app_role]))
  OR public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
);

DROP POLICY IF EXISTS "Org admins can update clients" ON public.clients;
CREATE POLICY "Org admins can update clients" ON public.clients
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.organization_id = clients.organization_id AND user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['org_admin'::app_role,'super_admin'::app_role]))
  OR public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
);

DROP POLICY IF EXISTS "Org admins can delete clients" ON public.clients;
CREATE POLICY "Org admins can delete clients" ON public.clients
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.organization_id = clients.organization_id AND user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['org_admin'::app_role,'super_admin'::app_role]))
  OR public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
);

-- Per-customer domain link
ALTER TABLE public.pbx_domains ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pbx_domains_client ON public.pbx_domains(client_id);

-- Allow lemtel/org admins to manage pbx_domains
DROP POLICY IF EXISTS "lemtel admins manage domains" ON public.pbx_domains;
CREATE POLICY "lemtel admins manage domains" ON public.pbx_domains
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
  OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_lemtel_admin(auth.uid())
  OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
);