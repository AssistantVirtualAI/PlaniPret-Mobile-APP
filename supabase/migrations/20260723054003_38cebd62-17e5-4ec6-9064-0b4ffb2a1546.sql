
-- Contacts : source + dedup
ALTER TABLE public.planipret_ms_contacts
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'ms365_outlook',
  ADD COLUMN IF NOT EXISTS source_tenant_id text,
  ADD COLUMN IF NOT EXISTS source_account_email text,
  ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE INDEX IF NOT EXISTS idx_pp_ms_contacts_dedup ON public.planipret_ms_contacts(user_id, dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_ms_contacts_source ON public.planipret_ms_contacts(user_id, source);

-- Emails : Message-ID + hash + folder index
ALTER TABLE public.planipret_email_messages
  ADD COLUMN IF NOT EXISTS internet_message_id text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS locally_saved boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pp_email_msgid ON public.planipret_email_messages(user_id, internet_message_id) WHERE internet_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_email_hash ON public.planipret_email_messages(user_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_email_sent_at ON public.planipret_email_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_email_folder ON public.planipret_email_messages(user_id, folder, sent_at DESC);

-- Calendar : soft-delete pour delta
ALTER TABLE public.planipret_calendar_events
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pp_cal_events_active ON public.planipret_calendar_events(user_id, starts_at DESC) WHERE is_deleted = false;
