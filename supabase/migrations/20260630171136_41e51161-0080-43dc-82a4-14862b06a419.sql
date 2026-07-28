
-- Add missing columns to planipret_profiles
ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS ns_sip_password_ref text,
  ADD COLUMN IF NOT EXISTS ns_link_method text,
  ADD COLUMN IF NOT EXISTS auth_method text DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS login_email text,
  ADD COLUMN IF NOT EXISTS onboarding_email_sent_at timestamptz;

ALTER TABLE public.planipret_profiles
  ALTER COLUMN ns_domain SET DEFAULT 'planipret.ca';

-- Migration log table
CREATE TABLE IF NOT EXISTS public.planipret_ns_migration_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id uuid REFERENCES public.planipret_profiles(id) ON DELETE SET NULL,
  ns_extension text,
  ns_email_from_api text,
  portal_email text,
  match_status text NOT NULL,
  match_confidence text,
  reviewed boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_ns_migration_log TO authenticated;
GRANT ALL ON public.planipret_ns_migration_log TO service_role;

ALTER TABLE public.planipret_ns_migration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can manage planipret migration log" ON public.planipret_ns_migration_log;
CREATE POLICY "Super admin can manage planipret migration log"
ON public.planipret_ns_migration_log
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), '17d6507f-a9ca-409d-8e49-371d50332615'::uuid, 'org_admin'::app_role)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), '17d6507f-a9ca-409d-8e49-371d50332615'::uuid, 'org_admin'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_pp_ns_migration_log_status ON public.planipret_ns_migration_log(match_status);
CREATE INDEX IF NOT EXISTS idx_pp_ns_migration_log_broker ON public.planipret_ns_migration_log(broker_id);
CREATE INDEX IF NOT EXISTS idx_pp_ns_migration_log_reviewed ON public.planipret_ns_migration_log(reviewed);

DROP TRIGGER IF EXISTS trg_pp_ns_migration_log_updated_at ON public.planipret_ns_migration_log;
CREATE TRIGGER trg_pp_ns_migration_log_updated_at
BEFORE UPDATE ON public.planipret_ns_migration_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
