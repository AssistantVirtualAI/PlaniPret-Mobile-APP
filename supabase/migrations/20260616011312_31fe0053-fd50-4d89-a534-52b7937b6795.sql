DROP INDEX IF EXISTS public.pbx_queue_agents_org_pbx_uuid_uniq;
DROP INDEX IF EXISTS public.pbx_queue_agents_org_pbxuuid_uniq;
DROP INDEX IF EXISTS public.pbx_queue_agents_pbx_uuid_uniq;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id, pbx_uuid
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.pbx_queue_agents
  WHERE pbx_uuid IS NOT NULL
)
DELETE FROM public.pbx_queue_agents a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX pbx_queue_agents_org_pbx_uuid_key
  ON public.pbx_queue_agents (organization_id, pbx_uuid);