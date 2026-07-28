
ALTER TABLE public.planipret_contacts
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT,
  ADD COLUMN IF NOT EXISTS phone_display TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS planipret_contacts_user_source_phone_uidx
  ON public.planipret_contacts(user_id, source, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS planipret_contacts_phone_normalized_idx
  ON public.planipret_contacts(phone_normalized);
