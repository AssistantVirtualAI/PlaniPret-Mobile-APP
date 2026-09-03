INSERT INTO public.user_roles (user_id, organization_id, role)
SELECT p.user_id, p.organization_id, 'planipret_broker'::app_role
FROM public.planipret_profiles p
WHERE p.email = 'demo@avastatistic.ca' AND p.user_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;