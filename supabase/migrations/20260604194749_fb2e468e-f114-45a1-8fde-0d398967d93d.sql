create or replace function public.create_organization_for_user(_name text, _slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id uuid;
  _uid uuid := auth.uid();
  _final_slug text;
  _counter int := 0;
begin
  if _uid is null then raise exception 'not authenticated'; end if;

  _final_slug := lower(regexp_replace(coalesce(_slug, _name), '[^a-z0-9]+', '-', 'g'));
  _final_slug := trim(both '-' from _final_slug);
  if _final_slug = '' then _final_slug := 'org'; end if;

  while exists (select 1 from organizations where slug = _final_slug) loop
    _counter := _counter + 1;
    _final_slug := _final_slug || '-' || _counter::text;
  end loop;

  insert into organizations(name, slug, onboarding_completed, is_active)
  values (_name, _final_slug, true, true)
  returning id into _org_id;

  insert into organization_members(user_id, organization_id, accepted_at)
  values (_uid, _org_id, now());

  insert into user_roles(user_id, organization_id, role)
  values (_uid, _org_id, 'org_admin');

  insert into billing_config(organization_id, plan_tier, subscription_status)
  values (_org_id, 'free', 'active');

  return _org_id;
end;
$$;

grant execute on function public.create_organization_for_user(text, text) to authenticated;