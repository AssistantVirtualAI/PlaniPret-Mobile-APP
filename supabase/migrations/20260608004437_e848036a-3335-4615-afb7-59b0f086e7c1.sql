
-- Enable RLS on realtime.messages and require org-scoped topic naming.
-- Topics must look like "<organization_uuid>:<anything>"; only members of that org may subscribe.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth org members realtime read" ON realtime.messages;
CREATE POLICY "auth org members realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND topic ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:.*)?$'
  AND public.can_access_org(auth.uid(), (split_part(topic, ':', 1))::uuid)
);
