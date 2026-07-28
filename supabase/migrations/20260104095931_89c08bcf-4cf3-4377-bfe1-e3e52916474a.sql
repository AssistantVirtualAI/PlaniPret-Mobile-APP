-- Add authentication columns to client_members table
ALTER TABLE public.client_members 
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS login_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- Create unique index for login_id (partial index to allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_members_login_id 
  ON public.client_members(login_id) 
  WHERE login_id IS NOT NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_members_client_id_status 
  ON public.client_members(client_id, status);