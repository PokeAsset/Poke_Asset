-- PokéAsset cloud portfolio table. Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Each signed-in person can read and write only their own row.

create table if not exists public.portfolios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

drop policy if exists "read own portfolio" on public.portfolios;
create policy "read own portfolio" on public.portfolios
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "insert own portfolio" on public.portfolios;
create policy "insert own portfolio" on public.portfolios
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "update own portfolio" on public.portfolios;
create policy "update own portfolio" on public.portfolios
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own portfolio" on public.portfolios;
create policy "delete own portfolio" on public.portfolios
  for delete to authenticated using (auth.uid() = user_id);
