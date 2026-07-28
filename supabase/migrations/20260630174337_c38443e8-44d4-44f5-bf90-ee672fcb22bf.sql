ALTER TABLE public.planipret_phone_calls
  ADD CONSTRAINT fk_phone_calls_profile
  FOREIGN KEY (user_id) REFERENCES public.planipret_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.planipret_phone_messages
  ADD CONSTRAINT fk_phone_messages_profile
  FOREIGN KEY (user_id) REFERENCES public.planipret_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.planipret_voicemails
  ADD CONSTRAINT fk_voicemails_profile
  FOREIGN KEY (user_id) REFERENCES public.planipret_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_phone_calls_user_id ON public.planipret_phone_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_messages_user_id ON public.planipret_phone_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_user_id ON public.planipret_voicemails(user_id);

NOTIFY pgrst, 'reload schema';