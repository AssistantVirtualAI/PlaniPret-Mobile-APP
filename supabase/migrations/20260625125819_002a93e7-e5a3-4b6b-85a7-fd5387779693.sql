
UPDATE public.organizations
   SET name = 'Planipret', slug = 'planipret'
 WHERE id = '17d6507f-a9ca-409d-8e49-371d50332615';

INSERT INTO public.organizations (id, name, slug, is_internal, is_active, onboarding_completed)
VALUES ('a7a0c1d2-1111-4aaa-9aaa-a0a0a0a0a0a1', 'AVA', 'ava', true, true, true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_planipret_only(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_planipret_member(_user_id)
     AND NOT public.is_lemtel_member(_user_id)
     AND NOT public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_lemtel_only(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_lemtel_member(_user_id)
     AND NOT public.is_planipret_member(_user_id)
     AND NOT public.is_super_admin(_user_id)
$$;
