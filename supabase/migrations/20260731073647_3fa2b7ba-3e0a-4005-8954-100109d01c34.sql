-- Remove blanket read access to the SIP password column on pbx_softphone_users.
-- Row policies still allow directory reads, but the credential column becomes
-- unreadable/unwritable for end users; only service_role (edge functions) can touch it.

REVOKE SELECT, UPDATE, INSERT ON public.pbx_softphone_users FROM authenticated;
REVOKE SELECT, UPDATE, INSERT ON public.pbx_softphone_users FROM anon;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pbx_softphone_users'
    AND column_name <> 'sip_password';

  EXECUTE format('GRANT SELECT (%s) ON public.pbx_softphone_users TO authenticated', cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.pbx_softphone_users TO authenticated', cols);
  EXECUTE format('GRANT INSERT (%s) ON public.pbx_softphone_users TO authenticated', cols);
END $$;

GRANT DELETE ON public.pbx_softphone_users TO authenticated;
GRANT ALL ON public.pbx_softphone_users TO service_role;

-- Keep the org-wide directory row policy, but make it explicit that it is a
-- directory read (non-credential columns only, enforced by the grants above).
DROP POLICY IF EXISTS "org_members_select" ON public.pbx_softphone_users;
CREATE POLICY "org_members_directory_select"
ON public.pbx_softphone_users
FOR SELECT
TO authenticated
USING (
  organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

-- The safe view already excludes sip_password; make sure it is not a security
-- definer bypass and that anon cannot read it.
REVOKE ALL ON public.pbx_softphone_users_safe FROM anon;
GRANT SELECT ON public.pbx_softphone_users_safe TO authenticated;
GRANT ALL ON public.pbx_softphone_users_safe TO service_role;