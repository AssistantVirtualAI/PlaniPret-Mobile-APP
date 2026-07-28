-- Fix: prevent password hashes from being exposed via broad SELECT on clients/client_members.
-- Approach: move credential fields to dedicated tables and update safe views.

-- 1) Create dedicated credential tables
CREATE TABLE IF NOT EXISTS public.client_credentials (
  client_id uuid PRIMARY KEY,
  password_hash text NULL,
  password_reset_token text NULL,
  password_reset_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_credentials_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.client_member_credentials (
  member_id uuid PRIMARY KEY,
  password_hash text NULL,
  password_reset_token text NULL,
  password_reset_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_member_credentials_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.client_members(id) ON DELETE CASCADE
);

ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_member_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_credentials' AND policyname='Service role can manage client credentials'
  ) THEN
    CREATE POLICY "Service role can manage client credentials"
    ON public.client_credentials
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_member_credentials' AND policyname='Service role can manage client member credentials'
  ) THEN
    CREATE POLICY "Service role can manage client member credentials"
    ON public.client_member_credentials
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 2) Trigger to keep updated_at fresh (avoid touching existing shared triggers)
CREATE OR REPLACE FUNCTION public.set_updated_at_client_credentials()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_client_credentials_updated_at ON public.client_credentials;
CREATE TRIGGER set_client_credentials_updated_at
BEFORE UPDATE ON public.client_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_client_credentials();

DROP TRIGGER IF EXISTS set_client_member_credentials_updated_at ON public.client_member_credentials;
CREATE TRIGGER set_client_member_credentials_updated_at
BEFORE UPDATE ON public.client_member_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_client_credentials();

-- 3) Backfill from existing columns (idempotent)
INSERT INTO public.client_credentials (client_id, password_hash, password_reset_token, password_reset_expires_at)
SELECT c.id, c.password_hash, c.password_reset_token, c.password_reset_expires_at
FROM public.clients c
ON CONFLICT (client_id) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    password_reset_token = EXCLUDED.password_reset_token,
    password_reset_expires_at = EXCLUDED.password_reset_expires_at;

INSERT INTO public.client_member_credentials (member_id, password_hash, password_reset_token, password_reset_expires_at)
SELECT m.id, m.password_hash, m.password_reset_token, m.password_reset_expires_at
FROM public.client_members m
ON CONFLICT (member_id) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    password_reset_token = EXCLUDED.password_reset_token,
    password_reset_expires_at = EXCLUDED.password_reset_expires_at;

-- 4) Update safe views to compute has_password from credential tables
CREATE OR REPLACE VIEW public.clients_safe AS
SELECT
  c.id,
  c.name,
  c.email,
  c.username,
  c.login_id,
  c.language,
  c.theme,
  c.status,
  c.custom_css,
  c.access_controls,
  c.organization_id,
  c.assigned_agent_id,
  c.assigned_agents,
  c.user_id,
  c.created_by,
  c.created_at,
  c.updated_at,
  (cc.password_hash IS NOT NULL) AS has_password
FROM public.clients c
LEFT JOIN public.client_credentials cc ON cc.client_id = c.id;

CREATE OR REPLACE VIEW public.client_members_safe AS
SELECT
  m.id,
  m.client_id,
  m.email,
  m.name,
  m.login_id,
  m.role,
  m.status,
  m.last_login_at,
  m.created_at,
  (cmc.password_hash IS NOT NULL) AS has_password
FROM public.client_members m
LEFT JOIN public.client_member_credentials cmc ON cmc.member_id = m.id;

-- 5) Drop sensitive columns from broadly-readable tables (now that views no longer depend on them)
ALTER TABLE public.clients
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS password_reset_token,
  DROP COLUMN IF EXISTS password_reset_expires_at;

ALTER TABLE public.client_members
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS password_reset_token,
  DROP COLUMN IF EXISTS password_reset_expires_at;