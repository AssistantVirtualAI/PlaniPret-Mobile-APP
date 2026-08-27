CREATE TABLE IF NOT EXISTS public.planipret_portal_2fa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS pp_2fa_backup_user_idx ON public.planipret_portal_2fa_backup_codes(user_id) WHERE used_at IS NULL;
GRANT ALL ON public.planipret_portal_2fa_backup_codes TO service_role;
ALTER TABLE public.planipret_portal_2fa_backup_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no direct access to backup codes" ON public.planipret_portal_2fa_backup_codes;
CREATE POLICY "no direct access to backup codes" ON public.planipret_portal_2fa_backup_codes FOR SELECT TO authenticated USING (false);