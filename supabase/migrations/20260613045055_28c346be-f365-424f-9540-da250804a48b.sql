CREATE TABLE public.mascot_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  title text NOT NULL DEFAULT 'New chat',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mascot_threads TO authenticated;
GRANT ALL ON public.mascot_threads TO service_role;

ALTER TABLE public.mascot_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mascot threads"
  ON public.mascot_threads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_mascot_threads_user_recent ON public.mascot_threads(user_id, last_message_at DESC);

CREATE TRIGGER mascot_threads_set_updated_at
  BEFORE UPDATE ON public.mascot_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mascot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.mascot_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mascot_messages TO authenticated;
GRANT ALL ON public.mascot_messages TO service_role;

ALTER TABLE public.mascot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mascot messages"
  ON public.mascot_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_mascot_messages_thread ON public.mascot_messages(thread_id, created_at);