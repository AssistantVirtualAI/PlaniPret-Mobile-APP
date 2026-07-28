ALTER TABLE public.planipret_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.planipret_profiles DROP CONSTRAINT IF EXISTS planipret_profiles_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS planipret_profiles_user_id_unique ON public.planipret_profiles (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS planipret_profiles_org_ns_ext_unique ON public.planipret_profiles (organization_id, ns_extension) WHERE ns_extension IS NOT NULL;
NOTIFY pgrst, 'reload schema';