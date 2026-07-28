
ALTER TABLE public.pbx_softphone_users
  ADD COLUMN IF NOT EXISTS forward_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forward_to text;

DROP POLICY IF EXISTS "self_update_presence_forwarding" ON public.pbx_softphone_users;
CREATE POLICY "self_update_presence_forwarding"
ON public.pbx_softphone_users
FOR UPDATE
TO authenticated
USING (portal_user_id = auth.uid())
WITH CHECK (portal_user_id = auth.uid());
