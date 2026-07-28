
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ms365_token_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS ms365_email text,
  ADD COLUMN IF NOT EXISTS ms365_display_name text,
  ADD COLUMN IF NOT EXISTS ns_extension text,
  ADD COLUMN IF NOT EXISTS ns_sip_username text,
  ADD COLUMN IF NOT EXISTS ns_linked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ns_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS sip_username text,
  ADD COLUMN IF NOT EXISTS sip_password text,
  ADD COLUMN IF NOT EXISTS sip_domain text,
  ADD COLUMN IF NOT EXISTS sip_proxy text;

CREATE INDEX IF NOT EXISTS idx_planipret_profiles_ms365_email ON public.planipret_profiles(lower(ms365_email));
CREATE INDEX IF NOT EXISTS idx_planipret_profiles_ns_extension ON public.planipret_profiles(ns_extension);
