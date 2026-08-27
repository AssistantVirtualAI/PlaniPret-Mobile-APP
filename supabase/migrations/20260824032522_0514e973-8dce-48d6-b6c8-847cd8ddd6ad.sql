ALTER TABLE public.planipret_portal_2fa_challenges ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE public.planipret_portal_2fa_challenges ADD COLUMN IF NOT EXISTS email text;