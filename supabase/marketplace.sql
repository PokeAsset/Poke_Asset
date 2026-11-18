-- PokéAsset marketplace tables. Run AFTER setup.sql: Supabase -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again. All permissions are enforced here in the database (Row Level Security), not in the app.

-- ---------- admins ----------
-- Only people listed here can use Marketplace ops. Rows are added by you in the SQL Editor (see the end of this file).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- listings ----------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  seller_name text not null default 'Collector' check (char_length(seller_name) between 1 and 40),
  kind text not null check (kind in ('card', 'sealed')),
  title text not null check (char_length(title) between 2 and 140),
  description text not null default '' check (char_length(description) <= 2000),
  set_name text,
  grade text,
  condition text,
  qty int not null default 1 check (qty between 1 and 999),
  price numeric(10, 2) not null check (price > 0 and price < 1000000),
  market_price numeric(10, 2),
  market_source text,
  image_url text,
  photo_urls text[] not null default '{}',
  external_url text,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'removed')),
  admin_removed boolean not null default false,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_status_created on public.listings (status, created_at desc);
create index if not exists listings_seller on public.listings (seller_id);
alter table public.listings enable row level security;

drop policy if exists "read listings" on public.listings;
create policy "read listings" on public.listings for select to anon, authenticated
  using (status <> 'removed' or seller_id = auth.uid() or public.is_admin());

drop policy if exists "sellers create own" on public.listings;
create policy "sellers create own" on public.listings for insert to authenticated
  with check (seller_id = auth.uid() and not admin_removed and status in ('available', 'reserved'));

drop policy if exists "sellers edit own" on public.listings;
create policy "sellers edit own" on public.listings for update to authenticated
  using (seller_id = auth.uid() and not admin_removed)
  with check (seller_id = auth.uid() and not admin_removed);

drop policy if exists "admins manage listings" on public.listings;
create policy "admins manage listings" on public.listings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.listings_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.listings where seller_id = new.seller_id and status in ('available', 'reserved')) >= 100 then
      raise exception 'You already have 100 active listings. Remove or sell some first.';
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists listings_before_trg on public.listings;
create trigger listings_before_trg before insert or update on public.listings
  for each row execute function public.listings_before();

-- ---------- listing history ----------
create table if not exists public.listing_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  actor_id uuid,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists listing_events_listing on public.listing_events (listing_id, created_at desc);
alter table public.listing_events enable row level security;
drop policy if exists "read own listing history" on public.listing_events;
create policy "read own listing history" on public.listing_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

create or replace function public.listings_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.listing_events (listing_id, actor_id, event, detail)
      values (new.id, auth.uid(), 'created', 'Listed at $' || new.price);
  else
    if new.status is distinct from old.status then
      insert into public.listing_events (listing_id, actor_id, event, detail)
        values (new.id, auth.uid(), case when new.admin_removed and not old.admin_removed then 'removed by admin' else 'status' end,
                old.status || ' to ' || new.status || coalesce(' (' || new.removed_reason || ')', ''));
    end if;
    if new.price is distinct from old.price then
      insert into public.listing_events (listing_id, actor_id, event, detail)
        values (new.id, auth.uid(), 'price', '$' || old.price || ' to $' || new.price);
    end if;
    if new.title is distinct from old.title or new.description is distinct from old.description
       or new.photo_urls is distinct from old.photo_urls or new.qty is distinct from old.qty then
      insert into public.listing_events (listing_id, actor_id, event, detail) values (new.id, auth.uid(), 'edited', null);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists listings_log_trg on public.listings;
create trigger listings_log_trg after insert or update on public.listings
  for each row execute function public.listings_log();

-- ---------- reports ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);
alter table public.reports enable row level security;
drop policy if exists "report a listing" on public.reports;
create policy "report a listing" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
drop policy if exists "read reports" on public.reports;
create policy "read reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "admins handle reports" on public.reports;
create policy "admins handle reports" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- orders ----------
-- source "pokeasset": a request to buy a PokéAsset listing. PokéAsset takes NO payment: payment is always "not_processed".
-- source "external": a purchase the buyer made somewhere else and logged here for their own records.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'pokeasset' check (source in ('pokeasset', 'external')),
  listing_id uuid references public.listings (id) on delete set null,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid references auth.users (id) on delete set null,
  seller_name text,
  title text not null check (char_length(title) between 2 and 140),
  price numeric(10, 2) not null check (price >= 0 and price < 1000000),
  qty int not null default 1 check (qty between 1 and 999),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'declined', 'shipped', 'completed', 'cancelled')),
  platform text,
  external_url text,
  note text not null default '' check (char_length(note) <= 1000),
  payment text not null default 'not_processed' check (payment = 'not_processed'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller on public.orders (seller_id, created_at desc);
alter table public.orders enable row level security;

drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
drop policy if exists "create own orders" on public.orders;
create policy "create own orders" on public.orders for insert to authenticated with check (buyer_id = auth.uid());
drop policy if exists "update own orders" on public.orders;
create policy "update own orders" on public.orders for update to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  actor_id uuid,
  event text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
drop policy if exists "read own order history" on public.order_events;
create policy "read own order history" on public.order_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())));

create or replace function public.orders_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.buyer_id := me;
    new.payment := 'not_processed';
    if new.source = 'pokeasset' then
      select * into l from public.listings where id = new.listing_id for share;
      if not found or l.status <> 'available' then raise exception 'That listing is not available.'; end if;
      if l.seller_id = me then raise exception 'You cannot order your own listing.'; end if;
      if new.qty > l.qty then raise exception 'Only % available.', l.qty; end if;
      new.seller_id := l.seller_id;
      new.seller_name := l.seller_name;
      new.title := l.title;
      new.price := l.price;
      new.status := 'requested';
      new.platform := null;
      new.external_url := null;
    else
      new.listing_id := null;
      new.seller_id := null;
    end if;
    return new;
  end if;

  -- updates: the item, price, people and source never change; only status and note do
  if new.source is distinct from old.source or new.listing_id is distinct from old.listing_id
     or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
     or new.title is distinct from old.title or new.price is distinct from old.price
     or new.qty is distinct from old.qty or new.payment is distinct from old.payment then
    raise exception 'Only the status and note of an order can change.';
  end if;
  if new.status is distinct from old.status and not public.is_admin() then
    if old.source = 'external' then
      null; -- the buyer keeps their own record however they like
    elsif me = old.seller_id then
      if new.status not in ('accepted', 'declined', 'shipped', 'completed') then raise exception 'Sellers can accept, decline, ship or complete an order.'; end if;
    elsif me = old.buyer_id then
      if new.status <> 'cancelled' or old.status not in ('requested', 'accepted') then raise exception 'Buyers can cancel an order that has not shipped.'; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists orders_before_trg on public.orders;
create trigger orders_before_trg before insert or update on public.orders
  for each row execute function public.orders_before();

create or replace function public.orders_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, actor_id, event, detail)
      values (new.id, auth.uid(), 'created', case when new.source = 'external' then 'Logged an outside purchase' else 'Requested to buy (no payment taken)' end);
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, event, detail) values (new.id, auth.uid(), 'status', old.status || ' to ' || new.status);
    if new.listing_id is not null and new.source = 'pokeasset' then
      if new.status = 'accepted' then
        update public.listings set status = 'reserved' where id = new.listing_id and status = 'available';
      elsif new.status = 'completed' then
        update public.listings set status = 'sold' where id = new.listing_id and status in ('available', 'reserved');
      elsif new.status in ('declined', 'cancelled') then
        update public.listings set status = 'available' where id = new.listing_id and status = 'reserved';
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists orders_after_trg on public.orders;
create trigger orders_after_trg after insert or update on public.orders
  for each row execute function public.orders_after();

-- ---------- listing photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "upload own listing photos" on storage.objects;
create policy "upload own listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own listing photos" on storage.objects;
create policy "delete own listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- make yourself the administrator ----------
-- Replace the email with the one you signed up with in PokéAsset, then run just this line:
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
