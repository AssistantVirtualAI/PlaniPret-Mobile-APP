ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS recording_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS recording_cached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_bytes INT;

CREATE INDEX IF NOT EXISTS idx_planipret_calls_recording_cached
  ON public.planipret_phone_calls (user_id, started_at DESC)
  WHERE recording_storage_path IS NOT NULL;