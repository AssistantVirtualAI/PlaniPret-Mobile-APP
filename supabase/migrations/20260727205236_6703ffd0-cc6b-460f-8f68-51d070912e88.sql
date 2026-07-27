CREATE TABLE public.planipret_hold_music (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_text text,
  improved_text text,
  language text NOT NULL DEFAULT 'fr',
  voice_id text,
  voice_name text,
  music_style text,
  music_volume numeric NOT NULL DEFAULT 0.25,
  storage_path text,
  duration_seconds numeric,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  is_default boolean NOT NULL DEFAULT false,
  pushed_at timestamptz,
  push_scope text,
  push_result jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_hold_music TO authenticated;
GRANT ALL ON public.planipret_hold_music TO service_role;

ALTER TABLE public.planipret_hold_music ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins manage hold music"
ON public.planipret_hold_music
FOR ALL
TO authenticated
USING (public.is_planipret_admin(auth.uid()))
WITH CHECK (public.is_planipret_admin(auth.uid()));

CREATE TRIGGER planipret_hold_music_updated_at
BEFORE UPDATE ON public.planipret_hold_music
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE INDEX idx_planipret_hold_music_created_at ON public.planipret_hold_music (created_at DESC);