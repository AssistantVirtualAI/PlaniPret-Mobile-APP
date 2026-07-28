-- Add columns to clients table for user accounts and agent assignment
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

-- Add index on username for performance
CREATE INDEX IF NOT EXISTS idx_clients_username ON public.clients(username);

-- Create function to generate unique usernames
CREATE OR REPLACE FUNCTION generate_unique_username(base_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username TEXT;
  counter INT := 0;
BEGIN
  -- Clean base name (remove spaces, special characters, convert to lowercase)
  username := LOWER(REGEXP_REPLACE(base_name, '[^a-zA-Z0-9]', '', 'g'));
  
  -- Ensure username is not empty
  IF username = '' THEN
    username := 'user';
  END IF;
  
  -- Check uniqueness and add number if necessary
  WHILE EXISTS (SELECT 1 FROM clients WHERE clients.username = username) LOOP
    counter := counter + 1;
    username := LOWER(REGEXP_REPLACE(base_name, '[^a-zA-Z0-9]', '', 'g')) || counter::TEXT;
  END LOOP;
  
  RETURN username;
END;
$$;