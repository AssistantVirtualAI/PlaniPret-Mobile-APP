ALTER TABLE public.planipret_profiles ALTER COLUMN mobile_app_enabled SET DEFAULT false;
ALTER TABLE public.planipret_profiles ALTER COLUMN voice_agent_enabled SET DEFAULT false;
UPDATE public.planipret_profiles SET mobile_app_enabled = false WHERE mobile_app_enabled IS NULL;
UPDATE public.planipret_profiles SET voice_agent_enabled = false WHERE voice_agent_enabled IS NULL;