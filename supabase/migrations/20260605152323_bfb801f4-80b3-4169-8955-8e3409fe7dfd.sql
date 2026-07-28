INSERT INTO public.organization_members (user_id, organization_id, accepted_at)
SELECT 'f859f1a4-aaee-4340-b3ac-a0883d051534', '17d6507f-a9ca-409d-8e49-371d50332615', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members
  WHERE user_id='f859f1a4-aaee-4340-b3ac-a0883d051534'
    AND organization_id='17d6507f-a9ca-409d-8e49-371d50332615'
);

INSERT INTO public.user_roles (user_id, organization_id, role)
SELECT 'f859f1a4-aaee-4340-b3ac-a0883d051534', '17d6507f-a9ca-409d-8e49-371d50332615', 'org_admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id='f859f1a4-aaee-4340-b3ac-a0883d051534'
    AND organization_id='17d6507f-a9ca-409d-8e49-371d50332615'
    AND role='org_admin'
);