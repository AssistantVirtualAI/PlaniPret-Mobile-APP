-- Drop old single-column unique index (conflict target was wrong)
DROP INDEX IF EXISTS public.pbx_queue_agents_pbx_uuid_uniq;

-- Clean up any duplicates that would block the new unique index
WITH dups AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, pbx_uuid
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM public.pbx_queue_agents
  WHERE pbx_uuid IS NOT NULL
)
DELETE FROM public.pbx_queue_agents a
USING dups
WHERE a.id = dups.id AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_queue_agents_org_pbx_uuid_uniq
  ON public.pbx_queue_agents (organization_id, pbx_uuid)
  WHERE pbx_uuid IS NOT NULL;