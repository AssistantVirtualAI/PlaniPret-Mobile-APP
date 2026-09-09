CREATE TABLE IF NOT EXISTS public.planipret_maestro_sms_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_number text NOT NULL,
  maestro_thread_id text,
  maestro_broker_id text,
  message_count integer NOT NULL DEFAULT 0,
  pushed_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_pushed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_number)
);

GRANT SELECT ON public.planipret_maestro_sms_threads TO authenticated;
GRANT ALL ON public.planipret_maestro_sms_threads TO service_role;

ALTER TABLE public.planipret_maestro_sms_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins read sms threads"
ON public.planipret_maestro_sms_threads
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR user_id = auth.uid());

CREATE TRIGGER planipret_maestro_sms_threads_touch
BEFORE UPDATE ON public.planipret_maestro_sms_threads
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pp_maestro_sms_threads_user ON public.planipret_maestro_sms_threads(user_id);