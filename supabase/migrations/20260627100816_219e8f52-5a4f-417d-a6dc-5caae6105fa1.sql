ALTER TABLE public.planipret_profiles
  ADD COLUMN IF NOT EXISTS widget_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS planipret_profiles_widget_enabled_idx
  ON public.planipret_profiles(widget_enabled) WHERE widget_enabled = true;
CREATE INDEX IF NOT EXISTS planipret_profiles_mobile_app_enabled_idx
  ON public.planipret_profiles(mobile_app_enabled) WHERE mobile_app_enabled = true;
CREATE INDEX IF NOT EXISTS planipret_profiles_voice_agent_enabled_idx
  ON public.planipret_profiles(voice_agent_enabled) WHERE voice_agent_enabled = true;