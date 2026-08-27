ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS maestro_media_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS maestro_media_sync_error text;

CREATE INDEX IF NOT EXISTS idx_pp_calls_maestro_media_pending
  ON public.planipret_phone_calls (created_at DESC)
  WHERE maestro_call_id IS NOT NULL AND maestro_media_synced_at IS NULL;