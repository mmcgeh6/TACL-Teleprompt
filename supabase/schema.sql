-- TACL Teleprompt: script storage
-- Run this once in the Supabase SQL editor (or apply as a migration).

create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled script',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scripts_user_updated_idx
  on public.scripts (user_id, updated_at desc);

-- Keep updated_at current on every edit
create or replace function public.scripts_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scripts_touch_updated_at on public.scripts;
create trigger scripts_touch_updated_at
  before update on public.scripts
  for each row execute function public.scripts_touch_updated_at();

-- Row level security: each signed-in user only sees their own scripts
alter table public.scripts enable row level security;

drop policy if exists "Users read own scripts" on public.scripts;
create policy "Users read own scripts" on public.scripts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own scripts" on public.scripts;
create policy "Users insert own scripts" on public.scripts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own scripts" on public.scripts;
create policy "Users update own scripts" on public.scripts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own scripts" on public.scripts;
create policy "Users delete own scripts" on public.scripts
  for delete to authenticated using ((select auth.uid()) = user_id);
