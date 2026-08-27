CREATE TABLE IF NOT EXISTS public.planipret_maestro_call_dedupe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  dedupe_key text NOT NULL,
  maestro_call_id text,
  provider_call_id text,
  local_call_id uuid,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS planipret_maestro_call_dedupe_key_idx
  ON public.planipret_maestro_call_dedupe (coalesce(user_id::text, 'global'), dedupe_key);

GRANT ALL ON public.planipret_maestro_call_dedupe TO service_role;
GRANT SELECT ON public.planipret_maestro_call_dedupe TO authenticated;

ALTER TABLE public.planipret_maestro_call_dedupe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own dedupe rows readable" ON public.planipret_maestro_call_dedupe;
CREATE POLICY "own dedupe rows readable"
  ON public.planipret_maestro_call_dedupe FOR SELECT TO authenticated
  USING (user_id = auth.uid());