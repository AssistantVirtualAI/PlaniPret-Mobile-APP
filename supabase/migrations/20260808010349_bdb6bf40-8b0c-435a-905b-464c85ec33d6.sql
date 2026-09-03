CREATE TABLE public.planipret_ava_directory_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caller text NOT NULL DEFAULT 'app',
  query text NOT NULL DEFAULT '',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources_queried text[] NOT NULL DEFAULT '{}',
  results_count integer NOT NULL DEFAULT 0,
  top_result text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pp_ava_dir_audit_user_created ON public.planipret_ava_directory_audit (user_id, created_at DESC);

GRANT SELECT, DELETE ON public.planipret_ava_directory_audit TO authenticated;
GRANT ALL ON public.planipret_ava_directory_audit TO service_role;

ALTER TABLE public.planipret_ava_directory_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own audit read" ON public.planipret_ava_directory_audit
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own audit purge" ON public.planipret_ava_directory_audit
  FOR DELETE TO authenticated USING (user_id = auth.uid());