ALTER TABLE public.planipret_profiles ALTER COLUMN voice_agent_enabled SET DEFAULT true;
UPDATE public.planipret_profiles SET voice_agent_enabled = true WHERE voice_agent_enabled IS NULL;