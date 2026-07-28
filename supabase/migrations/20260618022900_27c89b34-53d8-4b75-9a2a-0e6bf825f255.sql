CREATE TYPE public.porting_status AS ENUM ('submitted','in_review','approved','rejected','completed');

CREATE OR REPLACE FUNCTION public.is_member_of_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.current_user_org_ids() AS o WHERE o = _org)
$$;

CREATE TABLE public.number_porting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_carrier text NOT NULL,
  account_number text NOT NULL,
  pin text,
  numbers text[] NOT NULL DEFAULT '{}',
  service_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.porting_status NOT NULL DEFAULT 'submitted',
  notes text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.number_porting_requests TO authenticated;
GRANT ALL ON public.number_porting_requests TO service_role;

ALTER TABLE public.number_porting_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read porting" ON public.number_porting_requests
  FOR SELECT TO authenticated
  USING (public.is_member_of_org(organization_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "org members insert porting" ON public.number_porting_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of_org(organization_id));

CREATE POLICY "super admins manage porting" ON public.number_porting_requests
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER tr_porting_requests_updated
  BEFORE UPDATE ON public.number_porting_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_porting_org ON public.number_porting_requests(organization_id, status, created_at DESC);