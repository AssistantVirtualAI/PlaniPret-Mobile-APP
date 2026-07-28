-- Add slug column to agents table for custom portal URLs
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;

-- Create function to generate slug from agent name
CREATE OR REPLACE FUNCTION public.generate_agent_slug(agent_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  -- Clean name: lowercase, remove special chars, replace spaces with hyphens
  base_slug := LOWER(REGEXP_REPLACE(agent_name, '[^a-zA-Z0-9\s]', '', 'g'));
  base_slug := REGEXP_REPLACE(base_slug, '\s+', '-', 'g');
  base_slug := TRIM(BOTH '-' FROM base_slug);
  
  IF base_slug = '' THEN
    base_slug := 'agent';
  END IF;
  
  final_slug := base_slug;
  
  -- Check uniqueness and add number if necessary
  WHILE EXISTS (SELECT 1 FROM agents WHERE agents.slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter::TEXT;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Generate slugs for existing agents that don't have one
UPDATE public.agents 
SET slug = public.generate_agent_slug(name) 
WHERE slug IS NULL;

-- Add granular permission columns to client_agent_assignments
ALTER TABLE public.client_agent_assignments 
ADD COLUMN IF NOT EXISTS can_edit_knowledge BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_edit_prompt BOOLEAN DEFAULT false;

-- Update existing admin assignments to have edit permissions
UPDATE public.client_agent_assignments 
SET can_edit_knowledge = true, can_edit_prompt = true 
WHERE role = 'admin';

-- Create index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_agents_slug ON public.agents(slug);