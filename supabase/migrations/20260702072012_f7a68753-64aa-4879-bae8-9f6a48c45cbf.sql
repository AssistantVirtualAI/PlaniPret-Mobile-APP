-- AVA Phase 3: chat sessions, in-app notifications history, analytics view

create table if not exists public.planipret_ava_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Nouvelle conversation',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.planipret_ava_chat_sessions to authenticated;
grant all on public.planipret_ava_chat_sessions to service_role;
alter table public.planipret_ava_chat_sessions enable row level security;
create policy "own_sessions_all" on public.planipret_ava_chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ava_sessions_user_idx on public.planipret_ava_chat_sessions(user_id, last_message_at desc);

create table if not exists public.planipret_ava_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text not null default 'info',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  deep_link text,
  delivered boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.planipret_ava_notifications to authenticated;
grant all on public.planipret_ava_notifications to service_role;
alter table public.planipret_ava_notifications enable row level security;
create policy "own_notifs_select" on public.planipret_ava_notifications
  for select using (auth.uid() = user_id);
create policy "own_notifs_update" on public.planipret_ava_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ava_notifs_user_idx on public.planipret_ava_notifications(user_id, created_at desc);
alter publication supabase_realtime add table public.planipret_ava_notifications;

-- Analytics view: per-broker + global counts
create or replace view public.planipret_ava_stats as
select
  a.broker_user_id as user_id,
  count(distinct a.id) filter (where a.created_at > now() - interval '30 days') as analyses_30d,
  count(distinct a.id) filter (where a.urgency = 'high' and a.created_at > now() - interval '30 days') as urgent_30d,
  count(distinct a.id) filter (where a.intent = 'nouveau_lead' and a.created_at > now() - interval '30 days') as leads_30d,
  coalesce((select count(*) from public.planipret_ava_action_log l where l.broker_user_id = a.broker_user_id and l.success = true and l.executed_at > now() - interval '30 days'),0) as actions_ok_30d,
  coalesce((select count(*) from public.planipret_ava_action_log l where l.broker_user_id = a.broker_user_id and l.success = false and l.executed_at > now() - interval '30 days'),0) as actions_err_30d,
  coalesce((select count(*) from public.planipret_ava_action_log l where l.broker_user_id = a.broker_user_id and l.modified_by_broker = true and l.executed_at > now() - interval '30 days'),0) as actions_modified_30d
from public.planipret_ava_email_analyses a
group by a.broker_user_id;

grant select on public.planipret_ava_stats to authenticated;