-- Add password columns to clients table for secure authentication
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- Create index for fast token lookup during password reset
CREATE INDEX IF NOT EXISTS idx_clients_password_reset_token ON public.clients(password_reset_token) WHERE password_reset_token IS NOT NULL;