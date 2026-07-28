-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Set password for client alanisvasquez
-- Password: Alanis2024! (bcrypt hash generated with gen_salt)
UPDATE public.clients 
SET password_hash = crypt('Alanis2024!', gen_salt('bf', 10))
WHERE login_id = 'alanisvasquez';