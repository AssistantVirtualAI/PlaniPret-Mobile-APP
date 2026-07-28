ALTER TABLE public.planipret_phone_calls ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.planipret_phone_messages ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_calls_ns_call_id_unique_all
ON public.planipret_phone_calls (ns_call_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_messages_ns_message_id_unique_all
ON public.planipret_phone_messages (ns_message_id);

CREATE INDEX IF NOT EXISTS idx_pp_calls_extension_started
ON public.planipret_phone_calls (extension, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pp_messages_extension_created
ON public.planipret_phone_messages ((metadata->>'extension'), created_at DESC);