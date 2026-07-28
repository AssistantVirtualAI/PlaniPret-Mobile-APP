
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE UNIQUE INDEX IF NOT EXISTS pbx_extensions_org_pbxuuid_key   ON public.pbx_extensions   (organization_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pbx_devices_org_pbxuuid_key      ON public.pbx_devices      (organization_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pbx_ivrs_org_pbxuuid_key         ON public.pbx_ivrs         (organization_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pbx_call_queues_org_pbxuuid_key  ON public.pbx_call_queues  (organization_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pbx_ring_groups_org_pbxuuid_key  ON public.pbx_ring_groups  (organization_id, pbx_uuid) WHERE pbx_uuid IS NOT NULL;
