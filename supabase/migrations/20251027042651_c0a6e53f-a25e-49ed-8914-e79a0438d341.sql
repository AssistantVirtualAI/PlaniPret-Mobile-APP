-- Fix search_path for knowledge base search vector function
DROP TRIGGER IF EXISTS trigger_update_kb_search_vector ON knowledge_base_items;
DROP FUNCTION IF EXISTS update_kb_search_vector();

CREATE OR REPLACE FUNCTION update_kb_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector('french', 
    coalesce(NEW.title, '') || ' ' || 
    coalesce(NEW.content, '') || ' ' || 
    array_to_string(NEW.tags, ' ')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public';

CREATE TRIGGER trigger_update_kb_search_vector
  BEFORE INSERT OR UPDATE ON knowledge_base_items
  FOR EACH ROW EXECUTE FUNCTION update_kb_search_vector();