CREATE TABLE IF NOT EXISTS public.planipret_did_routing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  domain text NOT NULL,
  phone_number text NOT NULL,
  destination_user text,
  dial_rule_application text,
  dial_rule_parameter text,
  description text,
  enabled text,
  source text NOT NULL DEFAULT 'guardian',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_did_snap_number ON public.planipret_did_routing_snapshots (domain, phone_number, taken_at DESC);

GRANT SELECT ON public.planipret_did_routing_snapshots TO authenticated;
GRANT ALL ON public.planipret_did_routing_snapshots TO service_role;

ALTER TABLE public.planipret_did_routing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planipret admins can read DID snapshots"
ON public.planipret_did_routing_snapshots
FOR SELECT
TO authenticated
USING (public.is_planipret_admin(auth.uid()) OR public.is_super_admin(auth.uid()));