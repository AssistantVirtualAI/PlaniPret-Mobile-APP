-- Add language tracking to agent_insights so cached analyses match the UI language
ALTER TABLE public.agent_insights
ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fr';

-- Backfill any existing nulls defensively (shouldn't happen with NOT NULL + default, but safe)
UPDATE public.agent_insights
SET language = 'fr'
WHERE language IS NULL;

-- Helpful index for filtering insights by org/agent/language and time
CREATE INDEX IF NOT EXISTS idx_agent_insights_org_agent_lang_analyzed_at
ON public.agent_insights (organization_id, agent_id, language, analyzed_at DESC);