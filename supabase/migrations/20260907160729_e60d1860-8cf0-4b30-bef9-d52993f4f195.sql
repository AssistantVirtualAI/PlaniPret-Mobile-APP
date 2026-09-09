CREATE TABLE public.planipret_maestro_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('call','sms')),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  direction text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  status text,
  maestro_status text NOT NULL DEFAULT 'pending',
  maestro_object_id text,
  peer_number text,
  is_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planipret_maestro_activity TO authenticated;
GRANT ALL ON public.planipret_maestro_activity TO service_role;

ALTER TABLE public.planipret_maestro_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers read own maestro activity"
ON public.planipret_maestro_activity FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE INDEX idx_pp_maestro_activity_user_time ON public.planipret_maestro_activity (user_id, occurred_at DESC);
CREATE INDEX idx_pp_maestro_activity_status ON public.planipret_maestro_activity (maestro_status);

CREATE TRIGGER pp_maestro_activity_touch
BEFORE UPDATE ON public.planipret_maestro_activity
FOR EACH ROW EXECUTE FUNCTION public.planipret_set_updated_at();

CREATE OR REPLACE FUNCTION public.pp_log_maestro_activity_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.planipret_maestro_activity
    (user_id, kind, source_table, source_id, direction, occurred_at, duration_seconds, status,
     maestro_status, maestro_object_id, peer_number, is_ai)
  VALUES (
    NEW.user_id, 'call', 'planipret_phone_calls', NEW.id, NEW.direction,
    COALESCE(NEW.started_at, NEW.created_at, now()), COALESCE(NEW.duration_seconds, 0), NEW.status,
    CASE WHEN NEW.maestro_call_id IS NOT NULL OR COALESCE(NEW.maestro_synced, false) THEN 'synced' ELSE 'pending' END,
    NEW.maestro_call_id,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.from_number ELSE NEW.to_number END,
    NEW.ai_summary IS NOT NULL
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    direction = EXCLUDED.direction,
    occurred_at = EXCLUDED.occurred_at,
    duration_seconds = EXCLUDED.duration_seconds,
    status = EXCLUDED.status,
    maestro_status = EXCLUDED.maestro_status,
    maestro_object_id = EXCLUDED.maestro_object_id,
    peer_number = EXCLUDED.peer_number,
    is_ai = EXCLUDED.is_ai,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_log_maestro_activity_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.planipret_maestro_activity
    (user_id, kind, source_table, source_id, direction, occurred_at, duration_seconds, status,
     maestro_status, peer_number)
  VALUES (
    NEW.user_id, 'sms', 'planipret_phone_messages', NEW.id, NEW.direction,
    COALESCE(NEW.created_at, now()), 0, NEW.status,
    CASE WHEN COALESCE(NEW.maestro_synced, false) THEN 'synced' ELSE 'pending' END,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.from_number ELSE NEW.to_number END
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    direction = EXCLUDED.direction,
    occurred_at = EXCLUDED.occurred_at,
    status = EXCLUDED.status,
    maestro_status = EXCLUDED.maestro_status,
    peer_number = EXCLUDED.peer_number,
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pp_maestro_activity_from_calls
AFTER INSERT OR UPDATE ON public.planipret_phone_calls
FOR EACH ROW EXECUTE FUNCTION public.pp_log_maestro_activity_call();

CREATE TRIGGER pp_maestro_activity_from_messages
AFTER INSERT OR UPDATE ON public.planipret_phone_messages
FOR EACH ROW EXECUTE FUNCTION public.pp_log_maestro_activity_sms();

INSERT INTO public.planipret_maestro_activity
  (user_id, kind, source_table, source_id, direction, occurred_at, duration_seconds, status,
   maestro_status, maestro_object_id, peer_number, is_ai)
SELECT c.user_id, 'call', 'planipret_phone_calls', c.id, c.direction,
       COALESCE(c.started_at, c.created_at, now()), COALESCE(c.duration_seconds, 0), c.status,
       CASE WHEN c.maestro_call_id IS NOT NULL OR COALESCE(c.maestro_synced, false) THEN 'synced' ELSE 'pending' END,
       c.maestro_call_id,
       CASE WHEN c.direction = 'inbound' THEN c.from_number ELSE c.to_number END,
       c.ai_summary IS NOT NULL
FROM public.planipret_phone_calls c
WHERE c.user_id IS NOT NULL AND COALESCE(c.started_at, c.created_at) > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;

INSERT INTO public.planipret_maestro_activity
  (user_id, kind, source_table, source_id, direction, occurred_at, duration_seconds, status,
   maestro_status, peer_number)
SELECT m.user_id, 'sms', 'planipret_phone_messages', m.id, m.direction,
       COALESCE(m.created_at, now()), 0, m.status,
       CASE WHEN COALESCE(m.maestro_synced, false) THEN 'synced' ELSE 'pending' END,
       CASE WHEN m.direction = 'inbound' THEN m.from_number ELSE m.to_number END
FROM public.planipret_phone_messages m
WHERE m.user_id IS NOT NULL AND m.created_at > now() - interval '90 days'
ON CONFLICT (source_table, source_id) DO NOTHING;