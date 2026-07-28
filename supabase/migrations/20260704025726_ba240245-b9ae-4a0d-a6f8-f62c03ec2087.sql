-- Add generated helper flags for recording/transcript availability
ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS has_recording boolean
    GENERATED ALWAYS AS (recording_url IS NOT NULL AND recording_url <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_transcript boolean
    GENERATED ALWAYS AS (transcript IS NOT NULL AND transcript <> '') STORED;

CREATE INDEX IF NOT EXISTS idx_ppc_ns_call_id ON public.planipret_phone_calls(ns_call_id);
