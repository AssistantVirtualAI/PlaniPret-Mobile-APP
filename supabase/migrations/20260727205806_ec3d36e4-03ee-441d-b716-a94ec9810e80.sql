ALTER TABLE public.planipret_phone_messages
  ADD COLUMN IF NOT EXISTS maestro_synced boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pp_messages_maestro_synced
  ON public.planipret_phone_messages (maestro_synced, created_at DESC)
  WHERE maestro_synced = false;

UPDATE public.planipret_phone_messages
   SET maestro_synced = true
 WHERE maestro_synced = false
   AND (metadata ->> 'maestro_synced_at') IS NOT NULL;