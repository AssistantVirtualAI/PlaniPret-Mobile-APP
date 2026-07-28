CREATE TABLE IF NOT EXISTS public.org_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  owner_user_id uuid,
  name text NOT NULL,
  phone text,
  email text,
  company text,
  notes text,
  favorite boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_contacts_org ON public.org_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_contacts_phone ON public.org_contacts(organization_id, phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_contacts TO authenticated;
GRANT ALL ON public.org_contacts TO service_role;

ALTER TABLE public.org_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read org contacts"
  ON public.org_contacts FOR SELECT TO authenticated
  USING (organization_id IN (SELECT current_user_org_ids()) OR is_super_admin(auth.uid()));

CREATE POLICY "org members insert org contacts"
  ON public.org_contacts FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "org members update org contacts"
  ON public.org_contacts FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT current_user_org_ids()));

CREATE POLICY "org members delete org contacts"
  ON public.org_contacts FOR DELETE TO authenticated
  USING (organization_id IN (SELECT current_user_org_ids()));

CREATE OR REPLACE FUNCTION public.org_contacts_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_org_contacts_updated_at ON public.org_contacts;
CREATE TRIGGER trg_org_contacts_updated_at BEFORE UPDATE ON public.org_contacts
  FOR EACH ROW EXECUTE FUNCTION public.org_contacts_touch_updated_at();

ALTER TABLE public.lemtel_customers
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS domain_uuid text,
  ADD COLUMN IF NOT EXISTS domain_name text,
  ADD COLUMN IF NOT EXISTS admin_email text;

CREATE INDEX IF NOT EXISTS idx_lemtel_customers_domain_uuid ON public.lemtel_customers(domain_uuid);
