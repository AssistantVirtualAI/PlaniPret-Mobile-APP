
CREATE TABLE IF NOT EXISTS public.app_releases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tag text UNIQUE NOT NULL,
  name text,
  url text,
  published_at timestamptz,
  assets jsonb DEFAULT '[]'::jsonb,
  platform_urls jsonb DEFAULT '{}'::jsonb,
  is_latest boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon, authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app releases"
  ON public.app_releases FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.set_latest_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_releases SET is_latest = false WHERE id != NEW.id AND is_latest = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS latest_release_trigger ON public.app_releases;
CREATE TRIGGER latest_release_trigger
  AFTER INSERT ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_latest_release();

CREATE INDEX IF NOT EXISTS idx_app_releases_latest ON public.app_releases(is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_app_releases_published ON public.app_releases(published_at DESC);
