-- PokéAsset: shared price cache. Run this once in Supabase (SQL Editor -> New query -> paste -> Run).
-- Everyone reads prices from here, so the price service's daily credits are not spent per visitor.

create table if not exists public.sealed_prices (
  id text primary key,
  query_set text,
  name text not null,
  set_name text,
  type text,
  variant text,
  market numeric,
  low numeric,
  price_updated text,
  image_url text,
  tcg_player_id text,
  source text,
  provider text,
  history jsonb,
  fetched_at timestamptz not null default now()
);
create index if not exists sealed_prices_query_set_idx on public.sealed_prices (query_set);
create index if not exists sealed_prices_name_idx on public.sealed_prices (lower(name));

create table if not exists public.price_meta (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sealed_prices enable row level security;
alter table public.price_meta enable row level security;

drop policy if exists "anyone reads sealed prices" on public.sealed_prices;
create policy "anyone reads sealed prices" on public.sealed_prices for select to anon, authenticated using (true);
-- no insert/update/delete policies: only the server's secret key (which bypasses RLS) can write.

grant select on public.sealed_prices to anon, authenticated;
grant all on public.sealed_prices, public.price_meta to service_role;
notify pgrst, 'reload schema';
