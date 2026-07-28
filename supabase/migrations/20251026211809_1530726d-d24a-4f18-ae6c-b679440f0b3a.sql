-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration INTEGER, -- in seconds
  platform TEXT CHECK (platform IN ('elevenlabs', 'vapi', 'retell')),
  status TEXT CHECK (status IN ('completed', 'failed', 'in_progress')) DEFAULT 'completed',
  transcript TEXT,
  audio_url TEXT,
  satisfaction_score DECIMAL(3,2),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  keywords TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create knowledge_base table
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  synced_to_elevenlabs BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create agent_config table
CREATE TABLE public.agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  first_message TEXT,
  voice_id TEXT,
  voice_stability DECIMAL(3,2) DEFAULT 0.5,
  voice_similarity DECIMAL(3,2) DEFAULT 0.75,
  voice_style DECIMAL(3,2) DEFAULT 0.0,
  temperature DECIMAL(3,2) DEFAULT 0.8,
  max_tokens INTEGER DEFAULT 150,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create analytics table
CREATE TABLE public.analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_conversations INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0, -- in seconds
  avg_satisfaction DECIMAL(3,2),
  platform TEXT CHECK (platform IN ('elevenlabs', 'vapi', 'retell', 'all')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for conversations
CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON public.conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for knowledge_base
CREATE POLICY "Users can view own knowledge base"
  ON public.knowledge_base FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create knowledge base entries"
  ON public.knowledge_base FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge base"
  ON public.knowledge_base FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own knowledge base"
  ON public.knowledge_base FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for agent_config
CREATE POLICY "Users can view own agent configs"
  ON public.agent_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create agent configs"
  ON public.agent_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent configs"
  ON public.agent_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent configs"
  ON public.agent_config FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for analytics
CREATE POLICY "Users can view own analytics"
  ON public.analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics"
  ON public.analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_config_updated_at
  BEFORE UPDATE ON public.agent_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_created_at ON public.conversations(created_at DESC);
CREATE INDEX idx_knowledge_base_user_id ON public.knowledge_base(user_id);
CREATE INDEX idx_agent_config_user_id ON public.agent_config(user_id);
CREATE INDEX idx_analytics_user_date ON public.analytics(user_id, date DESC);