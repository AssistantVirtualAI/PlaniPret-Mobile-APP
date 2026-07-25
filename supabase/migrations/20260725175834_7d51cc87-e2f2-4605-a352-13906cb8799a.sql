create table if not exists public.planipret_voip_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  extension text,
  device_token text not null,
  platform text not null default 'ios',
  bundle_id text,
  environment text default 'production',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_token)
);

grant select, insert, update, delete on public.planipret_voip_push_tokens to authenticated;
grant all on public.planipret_voip_push_tokens to service_role;

alter table public.planipret_voip_push_tokens enable row level security;

create policy "voip_tokens_owner_read"  on public.planipret_voip_push_tokens for select to authenticated using (user_id = auth.uid());
create policy "voip_tokens_owner_write" on public.planipret_voip_push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "voip_tokens_owner_update" on public.planipret_voip_push_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "voip_tokens_owner_delete" on public.planipret_voip_push_tokens for delete to authenticated using (user_id = auth.uid());

create index if not exists idx_voip_push_tokens_user on public.planipret_voip_push_tokens(user_id);
create index if not exists idx_voip_push_tokens_ext  on public.planipret_voip_push_tokens(extension);