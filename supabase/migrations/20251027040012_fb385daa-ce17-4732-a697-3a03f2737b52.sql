-- Add test-related columns to organization_integrations
ALTER TABLE public.organization_integrations
ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS test_status TEXT CHECK (test_status IN ('pending', 'success', 'failed')) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS test_error TEXT;

-- Index for active and tested integrations
CREATE INDEX IF NOT EXISTS idx_org_integrations_test_status 
  ON public.organization_integrations(test_status, is_active);