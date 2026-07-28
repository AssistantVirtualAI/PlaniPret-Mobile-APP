DELETE FROM public.user_roles
WHERE user_id='f859f1a4-aaee-4340-b3ac-a0883d051534'
  AND organization_id='71755d33-ed64-4ad5-a828-61c9d2029eb7';

DELETE FROM public.organization_members
WHERE user_id='f859f1a4-aaee-4340-b3ac-a0883d051534'
  AND organization_id='71755d33-ed64-4ad5-a828-61c9d2029eb7';