CREATE TABLE IF NOT EXISTS public.planipret_tasks_projection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id text NOT NULL,
  due_at timestamptz,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);
CREATE INDEX IF NOT EXISTS planipret_tasks_projection_user_due_idx ON public.planipret_tasks_projection (user_id, due_at);

GRANT SELECT ON public.planipret_tasks_projection TO authenticated;
GRANT ALL ON public.planipret_tasks_projection TO service_role;
ALTER TABLE public.planipret_tasks_projection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own tasks projection read" ON public.planipret_tasks_projection;
CREATE POLICY "own tasks projection read" ON public.planipret_tasks_projection
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.planipret_task_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  action text NOT NULL,
  task_id text,
  http_status integer,
  response jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS planipret_task_mutations_user_idx ON public.planipret_task_mutations (user_id, created_at DESC);

GRANT ALL ON public.planipret_task_mutations TO service_role;
ALTER TABLE public.planipret_task_mutations ENABLE ROW LEVEL SECURITY;
-- No authenticated grant: idempotency ledger is service-role only.

ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_tasks_projection;