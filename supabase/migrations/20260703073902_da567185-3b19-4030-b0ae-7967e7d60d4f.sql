CREATE TABLE IF NOT EXISTS public.planipret_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id text NOT NULL UNIQUE,
  broker_id uuid NOT NULL REFERENCES public.planipret_profiles(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  remote_number text,
  state text NOT NULL DEFAULT 'ringing' CHECK (state IN ('ringing','active','ended')),
  answered_by text CHECK (answered_by IN ('mobile','widget')),
  answered_at timestamptz,
  ended_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_call_sessions_broker ON public.planipret_call_sessions(broker_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.planipret_call_sessions TO authenticated;
GRANT ALL ON public.planipret_call_sessions TO service_role;

ALTER TABLE public.planipret_call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker reads own call sessions"
  ON public.planipret_call_sessions FOR SELECT TO authenticated
  USING (broker_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()));

CREATE POLICY "broker inserts own call sessions"
  ON public.planipret_call_sessions FOR INSERT TO authenticated
  WITH CHECK (broker_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()));

CREATE POLICY "broker updates own call sessions"
  ON public.planipret_call_sessions FOR UPDATE TO authenticated
  USING (broker_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()))
  WITH CHECK (broker_id IN (SELECT id FROM public.planipret_profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.pp_call_sessions_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pp_call_sessions_touch ON public.planipret_call_sessions;
CREATE TRIGGER trg_pp_call_sessions_touch
  BEFORE UPDATE ON public.planipret_call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pp_call_sessions_touch();

ALTER TABLE public.planipret_call_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.planipret_call_sessions;

-- Atomic claim: returns true if the current caller wins the race to answer.
CREATE OR REPLACE FUNCTION public.pp_claim_call(_call_id text, _answered_by text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _profile_id uuid; _updated int;
BEGIN
  SELECT id INTO _profile_id FROM public.planipret_profiles WHERE user_id = auth.uid();
  IF _profile_id IS NULL THEN RETURN false; END IF;
  IF _answered_by NOT IN ('mobile','widget') THEN RETURN false; END IF;
  UPDATE public.planipret_call_sessions
    SET state = 'active', answered_by = _answered_by, answered_at = now()
    WHERE call_id = _call_id
      AND broker_id = _profile_id
      AND state = 'ringing';
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END; $$;

REVOKE ALL ON FUNCTION public.pp_claim_call(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pp_claim_call(text, text) TO authenticated;