
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS ns_callid text,
  ADD COLUMN IF NOT EXISTS ns_orig_callid text,
  ADD COLUMN IF NOT EXISTS ns_term_callid text;

CREATE INDEX IF NOT EXISTS idx_planipret_phone_calls_ns_callid
  ON public.planipret_phone_calls(ns_callid);

-- Backfill: extract NS callids from existing metadata for ALL rows.
-- Priority for ns_callid: call-parent-cdr-id (matches recording_api_path) > call-orig-call-id > call-term-call-id
UPDATE public.planipret_phone_calls
SET
  ns_callid = COALESCE(
    ns_callid,
    metadata->>'call-parent-cdr-id',
    metadata->>'call-orig-call-id',
    metadata->>'call-term-call-id',
    metadata->>'call-parent-call-id',
    metadata->>'id'
  ),
  ns_orig_callid = COALESCE(ns_orig_callid, metadata->>'call-orig-call-id'),
  ns_term_callid = COALESCE(ns_term_callid, metadata->>'call-term-call-id')
WHERE metadata IS NOT NULL
  AND (ns_callid IS NULL OR ns_orig_callid IS NULL OR ns_term_callid IS NULL);
