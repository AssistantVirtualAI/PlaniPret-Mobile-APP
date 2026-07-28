ALTER TABLE public.planipret_phone_calls DROP CONSTRAINT IF EXISTS planipret_phone_calls_user_id_fkey;
ALTER TABLE public.planipret_phone_messages DROP CONSTRAINT IF EXISTS planipret_phone_messages_user_id_fkey;
ALTER TABLE public.planipret_voicemails DROP CONSTRAINT IF EXISTS planipret_voicemails_user_id_fkey;
NOTIFY pgrst, 'reload schema';