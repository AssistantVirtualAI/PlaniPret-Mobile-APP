-- Ensure super admin is member of all 3 orgs (AVA as master_admin, Planipret/Lemtel kept as master_admin)
INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('a7a0c1d2-1111-4aaa-9aaa-a0a0a0a0a0a1', 'e5d025c9-eef2-4422-b97d-3190388b7376', 'master_admin')
ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;