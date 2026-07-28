-- =====================================================================
-- 1) pbx_queue_agents: add columns required by PBX sync + relax queue_id
-- =====================================================================
ALTER TABLE public.pbx_queue_agents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pbx_uuid text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- queue_id must be nullable so we can store PBX agent-registry rows that
-- aren't tied to a queue yet.
ALTER TABLE public.pbx_queue_agents ALTER COLUMN queue_id DROP NOT NULL;

-- Backfill organization_id from parent queue where possible
UPDATE public.pbx_queue_agents a
   SET organization_id = q.organization_id
  FROM public.pbx_call_queues q
 WHERE a.queue_id = q.id AND a.organization_id IS NULL;

-- Unique key for upsert(organization_id, pbx_uuid)
CREATE UNIQUE INDEX IF NOT EXISTS pbx_queue_agents_org_pbxuuid_uniq
  ON public.pbx_queue_agents(organization_id, pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS pbx_queue_agents_org_idx ON public.pbx_queue_agents(organization_id);
CREATE INDEX IF NOT EXISTS pbx_queue_agents_queue_idx ON public.pbx_queue_agents(queue_id);
CREATE INDEX IF NOT EXISTS pbx_queue_agents_ext_idx ON public.pbx_queue_agents(extension);

-- updated_at trigger
DROP TRIGGER IF EXISTS pbx_queue_agents_set_updated_at ON public.pbx_queue_agents;
CREATE TRIGGER pbx_queue_agents_set_updated_at
BEFORE UPDATE ON public.pbx_queue_agents
FOR EACH ROW EXECUTE FUNCTION public.pbx_set_updated_at();

-- Replace org policies so they work for queue rows AND PBX-only rows
DROP POLICY IF EXISTS "queue_agents_select" ON public.pbx_queue_agents;
DROP POLICY IF EXISTS "queue_agents_modify" ON public.pbx_queue_agents;

CREATE POLICY "queue_agents_select_v2" ON public.pbx_queue_agents
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.is_lemtel_member(auth.uid())
    OR (organization_id IS NOT NULL
        AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
    OR (queue_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.pbx_call_queues q
           WHERE q.id = pbx_queue_agents.queue_id
             AND q.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
       ))
  );

CREATE POLICY "queue_agents_modify_v2" ON public.pbx_queue_agents
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR (organization_id IS NOT NULL AND public.has_role(auth.uid(), organization_id, 'org_admin'::app_role))
    OR (queue_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.pbx_call_queues q
           WHERE q.id = pbx_queue_agents.queue_id
             AND public.has_role(auth.uid(), q.organization_id, 'org_admin'::app_role)
       ))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR (organization_id IS NOT NULL AND public.has_role(auth.uid(), organization_id, 'org_admin'::app_role))
    OR (queue_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.pbx_call_queues q
           WHERE q.id = pbx_queue_agents.queue_id
             AND public.has_role(auth.uid(), q.organization_id, 'org_admin'::app_role)
       ))
  );

-- =====================================================================
-- 2) Per-queue recording rules
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pbx_queue_recording_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.pbx_call_queues(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'all' CHECK (mode IN ('all','inbound','outbound')),
  announce boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(queue_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pbx_queue_recording_rules TO authenticated;
GRANT ALL ON public.pbx_queue_recording_rules TO service_role;

ALTER TABLE public.pbx_queue_recording_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_rec_rules_select" ON public.pbx_queue_recording_rules
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.is_lemtel_member(auth.uid())
    OR organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  );

CREATE POLICY "queue_rec_rules_modify" ON public.pbx_queue_recording_rules
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_lemtel_admin(auth.uid())
    OR public.has_role(auth.uid(), organization_id, 'org_admin'::app_role)
  );

DROP TRIGGER IF EXISTS pbx_queue_recording_rules_set_updated_at ON public.pbx_queue_recording_rules;
CREATE TRIGGER pbx_queue_recording_rules_set_updated_at
BEFORE UPDATE ON public.pbx_queue_recording_rules
FOR EACH ROW EXECUTE FUNCTION public.pbx_set_updated_at();