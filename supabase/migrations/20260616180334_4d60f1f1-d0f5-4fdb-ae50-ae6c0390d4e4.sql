
CREATE TABLE public.pbx_voicemail_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  extension text,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'tts',
  text_script text,
  voice_id text,
  voice_name text,
  storage_path text NOT NULL,
  duration_seconds integer,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vm_greetings_user ON public.pbx_voicemail_greetings(user_id, created_at DESC);
CREATE INDEX idx_vm_greetings_org ON public.pbx_voicemail_greetings(organization_id);
CREATE UNIQUE INDEX idx_vm_greetings_active_per_ext
  ON public.pbx_voicemail_greetings(user_id, coalesce(extension, ''))
  WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_voicemail_greetings TO authenticated;
GRANT ALL ON public.pbx_voicemail_greetings TO service_role;

ALTER TABLE public.pbx_voicemail_greetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_greetings"
  ON public.pbx_voicemail_greetings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_vm_greetings_updated_at
  BEFORE UPDATE ON public.pbx_voicemail_greetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
