create or replace function public.set_my_planipret_status(_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if _status not in ('available','busy','meeting','dnd','break','lunch','away','training','remote','offline') then
    raise exception 'invalid_status';
  end if;
  update public.planipret_profiles set status = _status, updated_at = now() where user_id = auth.uid();
end $$;
revoke all on function public.set_my_planipret_status(text) from public, anon;
grant execute on function public.set_my_planipret_status(text) to authenticated;