-- Table pour les exceptions super admin (pas de limite de clients)
CREATE TABLE IF NOT EXISTS public.super_admin_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  unlimited_clients boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Activer RLS
ALTER TABLE public.super_admin_exceptions ENABLE ROW LEVEL SECURITY;

-- Policy: Seuls les super admins peuvent voir cette table
CREATE POLICY "Super admins can view exceptions"
ON public.super_admin_exceptions
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Policy: Seuls les super admins peuvent modifier
CREATE POLICY "Super admins can manage exceptions"
ON public.super_admin_exceptions
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Insérer les super admins avec exception
INSERT INTO public.super_admin_exceptions (email, unlimited_clients)
VALUES 
  ('mhassoun@assistantvirtualai.com', true),
  ('amassaro@assistantvirtualai.com', true)
ON CONFLICT (email) DO NOTHING;