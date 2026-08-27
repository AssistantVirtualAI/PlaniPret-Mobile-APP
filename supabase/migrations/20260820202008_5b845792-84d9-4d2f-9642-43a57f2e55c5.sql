CREATE TABLE IF NOT EXISTS public.planipret_task_assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_maestro_id text NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, assistant_maestro_id)
);

GRANT SELECT ON public.planipret_task_assistants TO authenticated;
GRANT ALL ON public.planipret_task_assistants TO service_role;

ALTER TABLE public.planipret_task_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their authorized assistants"
ON public.planipret_task_assistants FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());