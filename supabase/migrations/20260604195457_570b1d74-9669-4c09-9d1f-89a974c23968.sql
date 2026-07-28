
-- Add client portal branding columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS client_portal_primary_color text,
  ADD COLUMN IF NOT EXISTS client_portal_logo_url text,
  ADD COLUMN IF NOT EXISTS client_portal_favicon_url text,
  ADD COLUMN IF NOT EXISTS client_portal_title text;

-- Singleton platform-wide branding overrides (super admin only)
CREATE TABLE IF NOT EXISTS public.platform_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  primary_color text,
  logo_url text,
  favicon_url text,
  website_title text,
  client_portal_primary_color text,
  client_portal_logo_url text,
  client_portal_favicon_url text,
  client_portal_title text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_branding TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_branding TO authenticated;
GRANT ALL ON public.platform_branding TO service_role;

ALTER TABLE public.platform_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_branding readable by everyone"
  ON public.platform_branding FOR SELECT
  USING (true);

CREATE POLICY "platform_branding writable by super admin"
  ON public.platform_branding FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_platform_branding_updated_at
  BEFORE UPDATE ON public.platform_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the singleton row
INSERT INTO public.platform_branding (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;
