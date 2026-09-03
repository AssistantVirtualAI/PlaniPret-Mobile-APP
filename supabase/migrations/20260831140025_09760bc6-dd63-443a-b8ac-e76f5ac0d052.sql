CREATE TABLE IF NOT EXISTS public.planipret_task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('due_soon','overdue')),
  due_at timestamptz,
  email text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, kind)
);

GRANT SELECT ON public.planipret_task_reminders TO authenticated;
GRANT ALL ON public.planipret_task_reminders TO service_role;

ALTER TABLE public.planipret_task_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_task_reminders_self_or_admin"
ON public.planipret_task_reminders
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_planipret_admin(auth.uid())
  OR public.is_super_admin(auth.uid())
);

CREATE TRIGGER planipret_task_reminders_updated_at
BEFORE UPDATE ON public.planipret_task_reminders
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pp_task_reminders_user ON public.planipret_task_reminders (user_id, sent_at DESC);

SELECT cron.unschedule('pp-task-reminders-hourly') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'pp-task-reminders-hourly'
);

SELECT cron.schedule(
  'pp-task-reminders-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gejxisrqtvxavbrfcoxz.supabase.co/functions/v1/pp-cron-task-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','ncuOl-PyCGfZkcNnKa1nZASSbra8ibxlcvzMNSLPHbaTafsnK3VUq31VNLo2VyJK'),
    body := jsonb_build_object('source','cron')
  );
  $$
);