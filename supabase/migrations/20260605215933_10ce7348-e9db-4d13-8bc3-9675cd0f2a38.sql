
DROP INDEX IF EXISTS public.pbx_extensions_org_pbxuuid_key;
DROP INDEX IF EXISTS public.pbx_devices_org_pbxuuid_key;
DROP INDEX IF EXISTS public.pbx_ivrs_org_pbxuuid_key;
DROP INDEX IF EXISTS public.pbx_call_queues_org_pbxuuid_key;
DROP INDEX IF EXISTS public.pbx_ring_groups_org_pbxuuid_key;

-- Need non-null pbx_uuid (or postgres rejects unique constraint with WHERE clause).
-- Clean any rows whose pbx_uuid is null (only mock seeded rows would be).
UPDATE public.pbx_extensions   SET pbx_uuid = 'legacy-'||id WHERE pbx_uuid IS NULL;
UPDATE public.pbx_devices      SET pbx_uuid = 'legacy-'||id WHERE pbx_uuid IS NULL;
UPDATE public.pbx_ivrs         SET pbx_uuid = 'legacy-'||id WHERE pbx_uuid IS NULL;
UPDATE public.pbx_call_queues  SET pbx_uuid = 'legacy-'||id WHERE pbx_uuid IS NULL;
UPDATE public.pbx_ring_groups  SET pbx_uuid = 'legacy-'||id WHERE pbx_uuid IS NULL;

ALTER TABLE public.pbx_extensions  ADD CONSTRAINT pbx_extensions_org_pbxuuid_key  UNIQUE (organization_id, pbx_uuid);
ALTER TABLE public.pbx_devices     ADD CONSTRAINT pbx_devices_org_pbxuuid_key     UNIQUE (organization_id, pbx_uuid);
ALTER TABLE public.pbx_ivrs        ADD CONSTRAINT pbx_ivrs_org_pbxuuid_key        UNIQUE (organization_id, pbx_uuid);
ALTER TABLE public.pbx_call_queues ADD CONSTRAINT pbx_call_queues_org_pbxuuid_key UNIQUE (organization_id, pbx_uuid);
ALTER TABLE public.pbx_ring_groups ADD CONSTRAINT pbx_ring_groups_org_pbxuuid_key UNIQUE (organization_id, pbx_uuid);
