-- Add language and period columns to agent_daily_reports for bilingual + period support
ALTER TABLE public.agent_daily_reports 
ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
ADD COLUMN IF NOT EXISTS period_days text NOT NULL DEFAULT '7',
ADD COLUMN IF NOT EXISTS period_start timestamptz NULL,
ADD COLUMN IF NOT EXISTS period_end timestamptz NULL;

-- Drop the old unique constraint if it exists
DROP INDEX IF EXISTS agent_daily_reports_agent_date_unique;

-- Create a new unique index for upserts by agent + date + language + period
CREATE UNIQUE INDEX IF NOT EXISTS agent_daily_reports_unique_idx 
ON public.agent_daily_reports (agent_id, report_date, language, period_days);