
CREATE TABLE IF NOT EXISTS public.pp_internal_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.pp_internal_config TO service_role;
ALTER TABLE public.pp_internal_config ENABLE ROW LEVEL SECURITY;
-- Aucune politique = personne d'autre que service_role ne peut y accéder.
