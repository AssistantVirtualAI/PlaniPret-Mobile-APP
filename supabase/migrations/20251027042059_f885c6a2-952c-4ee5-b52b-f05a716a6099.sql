-- Table pour stocker les articles de knowledge base
CREATE TABLE knowledge_base_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Général',
  tags TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  elevenlabs_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_kb_items_user_id ON knowledge_base_items(user_id);
CREATE INDEX idx_kb_items_category ON knowledge_base_items(category);
CREATE INDEX idx_kb_items_tags ON knowledge_base_items USING GIN(tags);
CREATE INDEX idx_kb_items_synced ON knowledge_base_items(is_synced);

-- Recherche full-text
ALTER TABLE knowledge_base_items ADD COLUMN search_vector tsvector;
CREATE INDEX idx_kb_items_search ON knowledge_base_items USING GIN(search_vector);

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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kb_search_vector
  BEFORE INSERT OR UPDATE ON knowledge_base_items
  FOR EACH ROW EXECUTE FUNCTION update_kb_search_vector();

-- RLS Policies
ALTER TABLE knowledge_base_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own KB items" ON knowledge_base_items
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own KB items" ON knowledge_base_items
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own KB items" ON knowledge_base_items
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own KB items" ON knowledge_base_items
  FOR DELETE USING (user_id = auth.uid());

-- Trigger pour updated_at
CREATE TRIGGER update_kb_items_updated_at 
  BEFORE UPDATE ON knowledge_base_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();