ALTER TABLE public.pbx_ai_insights
  ADD COLUMN IF NOT EXISTS coaching_notes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS coaching_score numeric;