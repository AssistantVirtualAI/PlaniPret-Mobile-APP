-- Update extension 300 with SIP credentials
UPDATE pbx_softphone_users 
SET 
  sip_password = 'Lemtel300!',
  sip_domain = 'lemtel.lemtel.tel',
  wss_url = 'wss://lemtel.lemtel.tel:7443',
  display_name = 'Mohamad Hassoun',
  account_status = 'active'
WHERE extension = '300';

INSERT INTO pbx_softphone_users (
  extension, sip_password, sip_domain, wss_url, display_name, status, account_status
)
SELECT '300', 'Lemtel300!', 'lemtel.lemtel.tel', 'wss://lemtel.lemtel.tel:7443', 'Mohamad Hassoun', 'offline', 'active'
WHERE NOT EXISTS (SELECT 1 FROM pbx_softphone_users WHERE extension = '300');

UPDATE pbx_extensions
SET pbx_uuid = '4b0efc15-d23d-426c-9285-b2c236254668'
WHERE extension = '300';

-- RLS policies
DROP POLICY IF EXISTS "service_role_all" ON pbx_softphone_users;
CREATE POLICY "service_role_all" ON pbx_softphone_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_read_own" ON pbx_softphone_users;
CREATE POLICY "users_read_own" ON pbx_softphone_users
  FOR SELECT TO authenticated
  USING (portal_user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_status" ON pbx_softphone_users;
CREATE POLICY "users_update_own_status" ON pbx_softphone_users
  FOR UPDATE TO authenticated
  USING (portal_user_id = auth.uid())
  WITH CHECK (portal_user_id = auth.uid());