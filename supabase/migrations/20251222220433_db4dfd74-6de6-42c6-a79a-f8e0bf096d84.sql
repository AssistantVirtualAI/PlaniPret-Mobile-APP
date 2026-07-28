-- Drop and recreate the function without client_limit column
CREATE OR REPLACE FUNCTION public.setup_new_user_organization(
  _user_id uuid,
  _user_email text,
  _full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _org_name text;
  _org_slug text;
  _trial_ends_at timestamptz;
BEGIN
  -- Generate organization name and slug
  _org_name := COALESCE(_full_name || '''s Agency', 'Agency ' || split_part(_user_email, '@', 1));
  _org_slug := lower(regexp_replace(split_part(_user_email, '@', 1), '[^a-z0-9]', '', 'g')) || '-' || extract(epoch from now())::bigint;

  -- Create organization
  INSERT INTO public.organizations (name, slug, onboarding_completed)
  VALUES (_org_name, _org_slug, false)
  RETURNING id INTO _org_id;

  -- Add user as organization member
  INSERT INTO public.organization_members (user_id, organization_id, accepted_at)
  VALUES (_user_id, _org_id, now());

  -- Assign org_admin role
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (_user_id, _org_id, 'org_admin');

  -- Create billing config with 7-day trial
  _trial_ends_at := now() + interval '7 days';
  
  INSERT INTO public.billing_config (organization_id, plan_tier, trial_ends_at, subscription_status)
  VALUES (_org_id, 'trial', _trial_ends_at, 'trialing');

  RETURN _org_id;
END;
$$;