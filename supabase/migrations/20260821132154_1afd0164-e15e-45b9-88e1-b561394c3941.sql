INSERT INTO public.organization_members (user_id, organization_id, accepted_at)
SELECT p.user_id, p.organization_id, now()
FROM public.planipret_profiles p
WHERE p.user_id IS NOT NULL
  AND p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = p.user_id AND m.organization_id = p.organization_id
  );

INSERT INTO public.org_members (user_id, org_id, role)
SELECT p.user_id, p.organization_id, CASE WHEN p.role = 'admin' THEN 'customer_admin' ELSE 'user' END
FROM public.planipret_profiles p
WHERE p.user_id IS NOT NULL
  AND p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = p.user_id AND m.org_id = p.organization_id
  );