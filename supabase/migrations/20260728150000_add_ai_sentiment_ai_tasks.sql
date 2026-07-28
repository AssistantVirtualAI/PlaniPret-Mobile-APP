-- Add missing columns ai_sentiment and ai_tasks to planipret_phone_calls.
-- These columns are referenced in maestro-sync-call/index.ts (CALL_COLUMNS) and
-- maestro-ai-analysis/index.ts but were never added via migration, causing the
-- Supabase .select() to return null for the row and triggering maestro_not_configured.

ALTER TABLE public.planipret_phone_calls
  ADD COLUMN IF NOT EXISTS ai_sentiment text,
  ADD COLUMN IF NOT EXISTS ai_tasks     jsonb;
