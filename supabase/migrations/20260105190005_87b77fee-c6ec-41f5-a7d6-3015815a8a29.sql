-- Create trigger function to auto-generate agent slug
CREATE OR REPLACE FUNCTION set_agent_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_agent_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on agents table
DROP TRIGGER IF EXISTS trigger_set_agent_slug ON agents;
CREATE TRIGGER trigger_set_agent_slug
  BEFORE INSERT ON agents
  FOR EACH ROW
  EXECUTE FUNCTION set_agent_slug();

-- Update existing agents that have no slug
UPDATE agents 
SET slug = generate_agent_slug(name)
WHERE slug IS NULL OR slug = '';