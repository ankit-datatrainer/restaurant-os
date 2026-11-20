-- ============================================================================
-- Restaurant OS — full setup for a NEW Supabase project
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Creates every table, security rule, function, realtime + storage, then loads
-- the demo café (Saffron Lane Café, tables DEMO1–DEMO8, 37 dishes) and the demo
-- staff login demo@restaurantos.app / demo1234. Includes migrations 0001–0007
-- (POS, bills, inventory, reservations, finance, staff, audit log, self-signup, platform console, push).
-- Run it once on an empty project.
-- ============================================================================

-- ---------- 0001_init.sql ----------
-- Restaurant OS — initial schema
-- Postgres 17 / Supabase. Applied with the Supabase MCP (apply_migration) or `supabase db push`.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('placed', 'accepted', 'preparing', 'ready', 'served', 'cancelled');
create type public.payment_method as enum ('upi', 'counter');
create type public.payment_status as enum ('pending', 'claimed', 'paid', 'refunded');
create type public.call_type as enum ('waiter', 'water', 'cutlery', 'bill', 'other');
create type public.call_status as enum ('open', 'attended');
create type public.staff_role as enum ('owner', 'manager', 'kitchen', 'waiter');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  logo_url text,
  cover_url text,
  address text,
  phone text,
  upi_id text,
  upi_payee_name text,
  currency text not null default 'INR',
  tax_rate numeric(5,2) not null default 5.00,
  service_charge_rate numeric(5,2) not null default 0.00,
  gstin text,
  is_open boolean not null default true,
  accepts_upi boolean not null default true,
  accepts_counter boolean not null default true,
  next_order_number integer not null default 1001,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role public.staff_role not null default 'manager',
  display_name text not null default 'Staff',
  created_at timestamptz not null default now()
);
create index staff_restaurant_idx on public.staff (restaurant_id);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code text not null unique,
  label text not null,
  area text,
  seats integer not null default 4,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint dining_tables_code_format check (code ~ '^[A-Z0-9]{3,12}$')
);
create index dining_tables_restaurant_idx on public.dining_tables (restaurant_id, sort_order);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);
create index menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort_order);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null references public.menu_categories (id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  is_veg boolean not null default true,
  badges text[] not null default '{}',
  option_groups jsonb not null default '[]'::jsonb,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  prep_minutes integer,
  created_at timestamptz not null default now()
);
create index menu_items_restaurant_idx on public.menu_items (restaurant_id, category_id, sort_order);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid not null references public.dining_tables (id) on delete restrict,
  order_number integer not null,
  guest_session_id uuid not null,
  guest_name text,
  status public.order_status not null default 'placed',
  payment_method public.payment_method not null default 'counter',
  payment_status public.payment_status not null default 'pending',
  note text,
  subtotal numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  service_charge numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number)
);
create index orders_restaurant_status_idx on public.orders (restaurant_id, status, placed_at desc);
create index orders_session_idx on public.orders (guest_session_id);
create index orders_table_idx on public.orders (table_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0 and quantity <= 50),
  is_veg boolean not null default true,
  options jsonb not null default '[]'::jsonb,
  note text,
  line_total numeric(10,2) not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.assistance_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid not null references public.dining_tables (id) on delete cascade,
  guest_session_id uuid,
  type public.call_type not null default 'waiter',
  note text,
  status public.call_status not null default 'open',
  created_at timestamptz not null default now(),
  attended_at timestamptz
);
create index assistance_calls_restaurant_idx on public.assistance_calls (restaurant_id, status, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  restaurant_name text,
  message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger restaurants_set_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Stamp status timestamps when an order moves along.
create or replace function public.orders_stamp_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' and new.accepted_at is null then new.accepted_at = now(); end if;
    if new.status = 'ready' and new.ready_at is null then new.ready_at = now(); end if;
    if new.status = 'served' and new.served_at is null then new.served_at = now(); end if;
    if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at = now(); end if;
  end if;
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.paid_at is null then
    new.paid_at = now();
  end if;
  return new;
end $$;

create trigger orders_stamp_status before update on public.orders
  for each row execute function public.orders_stamp_status();

-- Restaurant of the signed-in staff member (null for guests). SECURITY DEFINER avoids
-- recursive RLS on public.staff.
create or replace function public.current_staff_restaurant()
returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from public.staff where user_id = auth.uid() limit 1
$$;

create or replace function public.current_staff_role()
returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.staff where user_id = auth.uid() limit 1
$$;

-- Serialise an order with its items and table for API responses.
create or replace function public.order_json(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o)
    || jsonb_build_object(
         'items', coalesce((select jsonb_agg(to_jsonb(oi) order by oi.id) from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
         'table', (select jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label, 'area', t.area) from public.dining_tables t where t.id = o.table_id)
       )
  from public.orders o
  where o.id = p_order_id
$$;

-- ---------------------------------------------------------------------------
-- Guest-facing RPCs (SECURITY DEFINER: guests never write tables directly, and
-- prices are always taken from the menu, never from the client).
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_table_code text,
  p_guest_session_id uuid,
  p_guest_name text,
  p_payment_method public.payment_method,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.dining_tables%rowtype;
  v_rest public.restaurants%rowtype;
  v_order_id uuid;
  v_number integer;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_qty integer;
  v_unit numeric(10,2);
  v_opts jsonb;
  v_opt jsonb;
  v_group jsonb;
  v_choice jsonb;
  v_subtotal numeric(10,2) := 0;
  v_service numeric(10,2);
  v_tax numeric(10,2);
  v_total numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the order' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many items in one order' using errcode = 'P0001';
  end if;

  select * into v_table from public.dining_tables where code = upper(p_table_code) and is_active;
  if not found then
    raise exception 'This table QR is not active. Please ask the staff.' using errcode = 'P0001';
  end if;
  select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;
  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'upi' and not v_rest.accepts_upi then
    raise exception 'UPI payment is not available here.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'counter' and not v_rest.accepts_counter then
    raise exception 'Pay at counter is not available here.' using errcode = 'P0001';
  end if;

  v_number := v_rest.next_order_number;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rest.id;

  insert into public.orders (restaurant_id, table_id, order_number, guest_session_id, guest_name, payment_method, note)
  values (v_rest.id, v_table.id, v_number, p_guest_session_id, nullif(trim(coalesce(p_guest_name, '')), ''), p_payment_method, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Invalid quantity' using errcode = 'P0001';
    end if;
    select * into v_menu from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_rest.id;
    if not found then
      raise exception 'One of the dishes is no longer on the menu' using errcode = 'P0001';
    end if;
    if not v_menu.is_available then
      raise exception '% is sold out right now', v_menu.name using errcode = 'P0001';
    end if;

    v_unit := v_menu.price;
    v_opts := '[]'::jsonb;
    for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
      select g into v_group from jsonb_array_elements(v_menu.option_groups) g where g->>'id' = v_opt->>'group_id';
      if v_group is null then
        raise exception 'Unknown option for %', v_menu.name using errcode = 'P0001';
      end if;
      select c into v_choice from jsonb_array_elements(v_group->'choices') c where c->>'id' = v_opt->>'choice_id';
      if v_choice is null then
        raise exception 'Unknown option choice for %', v_menu.name using errcode = 'P0001';
      end if;
      v_unit := v_unit + coalesce((v_choice->>'price_delta')::numeric, 0);
      v_opts := v_opts || jsonb_build_object(
        'group_id', v_group->>'id', 'group_name', v_group->>'name',
        'choice_id', v_choice->>'id', 'choice_label', v_choice->>'label',
        'price_delta', coalesce((v_choice->>'price_delta')::numeric, 0));
    end loop;

    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total)
    values (v_order_id, v_menu.id, v_menu.name, v_unit, v_qty, v_menu.is_veg, v_opts, nullif(trim(coalesce(v_item->>'note', '')), ''), round(v_unit * v_qty, 2));
    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
  end loop;

  v_service := round(v_subtotal * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_subtotal + v_service) * v_rest.tax_rate / 100, 2);
  v_total := v_subtotal + v_service + v_tax;

  update public.orders
    set subtotal = v_subtotal, service_charge = v_service, tax_amount = v_tax, total = v_total
    where id = v_order_id;

  return public.order_json(v_order_id);
end $$;

create or replace function public.get_order(p_order_id uuid, p_guest_session_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.order_json(o.id) from public.orders o
  where o.id = p_order_id and o.guest_session_id = p_guest_session_id
$$;

create or replace function public.get_session_orders(p_table_code text, p_guest_session_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.order_json(o.id) order by o.placed_at desc), '[]'::jsonb)
  from public.orders o
  join public.dining_tables t on t.id = o.table_id
  where t.code = upper(p_table_code) and o.guest_session_id = p_guest_session_id
    and o.placed_at > now() - interval '12 hours'
$$;

create or replace function public.claim_payment(p_order_id uuid, p_guest_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.orders
    set payment_status = 'claimed'
    where id = p_order_id and guest_session_id = p_guest_session_id
      and payment_method = 'upi' and payment_status = 'pending';
  if not found then
    raise exception 'This order cannot be marked as paid' using errcode = 'P0001';
  end if;
  return public.order_json(p_order_id);
end $$;

create or replace function public.create_assistance_call(
  p_table_code text,
  p_guest_session_id uuid,
  p_type public.call_type,
  p_note text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.dining_tables%rowtype;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_table from public.dining_tables where code = upper(p_table_code) and is_active;
  if not found then
    raise exception 'This table QR is not active. Please ask the staff.' using errcode = 'P0001';
  end if;

  -- De-duplicate: one open call per table per type.
  select id into v_existing from public.assistance_calls
    where table_id = v_table.id and type = p_type and status = 'open'
    order by created_at desc limit 1;
  if v_existing is not null then
    return (select to_jsonb(c) || jsonb_build_object('table', jsonb_build_object('id', v_table.id, 'code', v_table.code, 'label', v_table.label, 'area', v_table.area))
            from public.assistance_calls c where c.id = v_existing);
  end if;

  insert into public.assistance_calls (restaurant_id, table_id, guest_session_id, type, note)
  values (v_table.restaurant_id, v_table.id, p_guest_session_id, p_type, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return (select to_jsonb(c) || jsonb_build_object('table', jsonb_build_object('id', v_table.id, 'code', v_table.code, 'label', v_table.label, 'area', v_table.area))
          from public.assistance_calls c where c.id = v_id);
end $$;

-- Lock down RPC execution: anon + authenticated may call the guest functions.
revoke all on function public.place_order(text, uuid, text, public.payment_method, text, jsonb) from public;
grant execute on function public.place_order(text, uuid, text, public.payment_method, text, jsonb) to anon, authenticated, service_role;
revoke all on function public.get_order(uuid, uuid) from public;
grant execute on function public.get_order(uuid, uuid) to anon, authenticated, service_role;
revoke all on function public.get_session_orders(text, uuid) from public;
grant execute on function public.get_session_orders(text, uuid) to anon, authenticated, service_role;
revoke all on function public.claim_payment(uuid, uuid) from public;
grant execute on function public.claim_payment(uuid, uuid) to anon, authenticated, service_role;
revoke all on function public.create_assistance_call(text, uuid, public.call_type, text) from public;
grant execute on function public.create_assistance_call(text, uuid, public.call_type, text) to anon, authenticated, service_role;
revoke all on function public.order_json(uuid) from public;
grant execute on function public.order_json(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.restaurants enable row level security;
alter table public.staff enable row level security;
alter table public.dining_tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.assistance_calls enable row level security;
alter table public.leads enable row level security;

-- restaurants: public read (menu page needs name/logo/UPI), staff update
create policy "restaurants public read" on public.restaurants for select using (true);
create policy "restaurants staff update" on public.restaurants for update
  using (id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'))
  with check (id = public.current_staff_restaurant());

-- staff: see yourself and your colleagues
create policy "staff read own restaurant" on public.staff for select
  using (user_id = auth.uid() or restaurant_id = public.current_staff_restaurant());

-- dining tables: public read of active tables (lookup by code), staff full control
create policy "tables public read" on public.dining_tables for select using (is_active or restaurant_id = public.current_staff_restaurant());
create policy "tables staff insert" on public.dining_tables for insert with check (restaurant_id = public.current_staff_restaurant());
create policy "tables staff update" on public.dining_tables for update using (restaurant_id = public.current_staff_restaurant());
create policy "tables staff delete" on public.dining_tables for delete using (restaurant_id = public.current_staff_restaurant());

-- menu: public read, staff write
create policy "categories public read" on public.menu_categories for select using (true);
create policy "categories staff insert" on public.menu_categories for insert with check (restaurant_id = public.current_staff_restaurant());
create policy "categories staff update" on public.menu_categories for update using (restaurant_id = public.current_staff_restaurant());
create policy "categories staff delete" on public.menu_categories for delete using (restaurant_id = public.current_staff_restaurant());

create policy "items public read" on public.menu_items for select using (true);
create policy "items staff insert" on public.menu_items for insert with check (restaurant_id = public.current_staff_restaurant());
create policy "items staff update" on public.menu_items for update using (restaurant_id = public.current_staff_restaurant());
create policy "items staff delete" on public.menu_items for delete using (restaurant_id = public.current_staff_restaurant());

-- orders: staff only (guests go through the RPCs above)
create policy "orders staff read" on public.orders for select using (restaurant_id = public.current_staff_restaurant());
create policy "orders staff update" on public.orders for update using (restaurant_id = public.current_staff_restaurant());
create policy "order items staff read" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.restaurant_id = public.current_staff_restaurant()));

-- assistance calls: staff read/update
create policy "calls staff read" on public.assistance_calls for select using (restaurant_id = public.current_staff_restaurant());
create policy "calls staff update" on public.assistance_calls for update using (restaurant_id = public.current_staff_restaurant());

-- leads: anyone can submit the contact form, nobody can read without the service role
create policy "leads public insert" on public.leads for insert with check (true);

-- ---------------------------------------------------------------------------
-- Realtime: the admin dashboard subscribes to these (RLS applies per subscriber)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.assistance_calls;
alter publication supabase_realtime add table public.dining_tables;
alter publication supabase_realtime add table public.menu_items;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for dish photos; staff may upload
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy "menu images public read" on storage.objects for select using (bucket_id = 'menu-images');
create policy "menu images staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.current_staff_restaurant() is not null);
create policy "menu images staff update" on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.current_staff_restaurant() is not null);
create policy "menu images staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.current_staff_restaurant() is not null);

-- ---------- 0002_order_item_position_billing_summary.sql ----------
-- Restaurant OS — 0002
-- 1. order_items.position: the order in which the guest added dishes, so the tracker, kitchen
--    ticket and bill all list them the same way (they used to come back sorted by a random uuid).
-- 2. billing_summary(): totals over every matching order for the billing page, which used to sum
--    a 300-row page in the browser and silently under-report on busy days.

alter table public.order_items add column if not exists position integer not null default 0;

-- Serialise an order with its items (in cart order) and table for API responses.
create or replace function public.order_json(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o)
    || jsonb_build_object(
         'items', coalesce((select jsonb_agg(to_jsonb(oi) order by oi.position, oi.id) from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
         'table', (select jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label, 'area', t.area) from public.dining_tables t where t.id = o.table_id)
       )
  from public.orders o
  where o.id = p_order_id
$$;

create or replace function public.place_order(
  p_table_code text,
  p_guest_session_id uuid,
  p_guest_name text,
  p_payment_method public.payment_method,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.dining_tables%rowtype;
  v_rest public.restaurants%rowtype;
  v_order_id uuid;
  v_number integer;
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_qty integer;
  v_unit numeric(10,2);
  v_opts jsonb;
  v_opt jsonb;
  v_group jsonb;
  v_choice jsonb;
  v_pos integer := 0;
  v_subtotal numeric(10,2) := 0;
  v_service numeric(10,2);
  v_tax numeric(10,2);
  v_total numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the order' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many items in one order' using errcode = 'P0001';
  end if;

  select * into v_table from public.dining_tables where code = upper(p_table_code) and is_active;
  if not found then
    raise exception 'This table QR is not active. Please ask the staff.' using errcode = 'P0001';
  end if;
  select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;
  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'upi' and not v_rest.accepts_upi then
    raise exception 'UPI payment is not available here.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'counter' and not v_rest.accepts_counter then
    raise exception 'Pay at counter is not available here.' using errcode = 'P0001';
  end if;

  v_number := v_rest.next_order_number;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rest.id;

  insert into public.orders (restaurant_id, table_id, order_number, guest_session_id, guest_name, payment_method, note)
  values (v_rest.id, v_table.id, v_number, p_guest_session_id, nullif(trim(coalesce(p_guest_name, '')), ''), p_payment_method, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'Invalid quantity' using errcode = 'P0001';
    end if;
    select * into v_menu from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_rest.id;
    if not found then
      raise exception 'One of the dishes is no longer on the menu' using errcode = 'P0001';
    end if;
    if not v_menu.is_available then
      raise exception '% is sold out right now', v_menu.name using errcode = 'P0001';
    end if;

    v_unit := v_menu.price;
    v_opts := '[]'::jsonb;
    for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
      select g into v_group from jsonb_array_elements(v_menu.option_groups) g where g->>'id' = v_opt->>'group_id';
      if v_group is null then
        raise exception 'Unknown option for %', v_menu.name using errcode = 'P0001';
      end if;
      select c into v_choice from jsonb_array_elements(v_group->'choices') c where c->>'id' = v_opt->>'choice_id';
      if v_choice is null then
        raise exception 'Unknown option choice for %', v_menu.name using errcode = 'P0001';
      end if;
      v_unit := v_unit + coalesce((v_choice->>'price_delta')::numeric, 0);
      v_opts := v_opts || jsonb_build_object(
        'group_id', v_group->>'id', 'group_name', v_group->>'name',
        'choice_id', v_choice->>'id', 'choice_label', v_choice->>'label',
        'price_delta', coalesce((v_choice->>'price_delta')::numeric, 0));
    end loop;

    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position)
    values (v_order_id, v_menu.id, v_menu.name, v_unit, v_qty, v_menu.is_veg, v_opts, nullif(trim(coalesce(v_item->>'note', '')), ''), round(v_unit * v_qty, 2), v_pos);
    v_pos := v_pos + 1;
    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
  end loop;

  v_service := round(v_subtotal * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_subtotal + v_service) * v_rest.tax_rate / 100, 2);
  v_total := v_subtotal + v_service + v_tax;

  update public.orders
    set subtotal = v_subtotal, service_charge = v_service, tax_amount = v_tax, total = v_total
    where id = v_order_id;

  return public.order_json(v_order_id);
end $$;

-- Billing totals over every matching order of a restaurant (cancelled excluded).
-- Runs as the caller, so staff RLS on orders still applies.
create or replace function public.billing_summary(p_restaurant_id uuid, p_since timestamptz default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'count', count(*),
    'paid', coalesce(sum(total) filter (where payment_status = 'paid'), 0),
    'due', coalesce(sum(total) filter (where payment_status in ('pending', 'claimed')), 0),
    'by_status', jsonb_build_object(
      'pending', count(*) filter (where payment_status = 'pending'),
      'claimed', count(*) filter (where payment_status = 'claimed'),
      'paid', count(*) filter (where payment_status = 'paid'),
      'refunded', count(*) filter (where payment_status = 'refunded')
    )
  )
  from public.orders
  where restaurant_id = p_restaurant_id
    and status <> 'cancelled'
    and (p_since is null or placed_at >= p_since)
$$;

revoke all on function public.billing_summary(uuid, timestamptz) from public;
grant execute on function public.billing_summary(uuid, timestamptz) to authenticated, service_role;

-- ---------- 0003_retention_plans_feedback.sql ----------
-- Restaurant OS — 0003: plans, customer retention (CRM + consent), feedback, add-to-order,
-- duplicate-order protection, waiter-call acknowledgement.
--
--  1. restaurants: plan (starter | growth | premium) + guest-experience settings
--  2. customers + consent_events: phone-based profiles with an explicit, revocable marketing consent
--  3. orders: customer_id, client_ref (idempotency key), items_added_at; order_items.round
--  4. feedback: one 1–5 rating per served order
--  5. leads: city, table_count, plan_interest (demo / founding-partner requests)
--  6. RPCs: place_order v3, add_order_items, get_session_calls, submit_feedback,
--     get_unsubscribe / unsubscribe_customer, revoke_marketing_consent, customer_list

-- ---------------------------------------------------------------------------
-- 1. Restaurant plan + guest-experience settings
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists plan text not null default 'growth',
  add column if not exists google_review_url text,
  add column if not exists story_title text,
  add column if not exists story_text text,
  add column if not exists story_video_url text,
  add column if not exists games_enabled boolean not null default true,
  add column if not exists feedback_enabled boolean not null default true,
  add column if not exists marketing_consent_enabled boolean not null default true;

do $$ begin
  alter table public.restaurants add constraint restaurants_plan_check check (plan in ('starter', 'growth', 'premium'));
exception when duplicate_object then null; end $$;

-- The plan is a commercial setting managed by Restaurant OS, never by restaurant staff.
create or replace function public.restaurants_guard_plan()
returns trigger language plpgsql as $$
begin
  if new.plan is distinct from old.plan and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Your plan is managed by Restaurant OS. Contact support to change it.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists restaurants_guard_plan on public.restaurants;
create trigger restaurants_guard_plan before update on public.restaurants
  for each row execute function public.restaurants_guard_plan();

-- ---------------------------------------------------------------------------
-- 2. Customers + consent records
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  name text,
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  consent_revoked_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index if not exists customers_restaurant_idx on public.customers (restaurant_id, last_seen_at desc);

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  action text not null check (action in ('granted', 'revoked')),
  source text not null check (source in ('qr_checkout', 'unsubscribe_link', 'staff')),
  consent_text text,
  created_at timestamptz not null default now()
);
create index if not exists consent_events_customer_idx on public.consent_events (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Orders: customer link, idempotency key, add-to-order tracking
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists customer_id uuid references public.customers (id) on delete set null,
  add column if not exists client_ref uuid,
  add column if not exists items_added_at timestamptz;
create unique index if not exists orders_client_ref_uniq on public.orders (restaurant_id, client_ref) where client_ref is not null;
create index if not exists orders_customer_idx on public.orders (customer_id);

-- 1 = the original order, 2+ = dishes the guest added later (the kitchen highlights them).
alter table public.order_items add column if not exists round integer not null default 1;

-- ---------------------------------------------------------------------------
-- 4. Feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  table_id uuid references public.dining_tables (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists feedback_restaurant_idx on public.feedback (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Leads: demo / founding-partner details
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists city text,
  add column if not exists table_count integer,
  add column if not exists plan_interest text;

-- ---------------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------------

-- "98450 12345", "+91 98450-12345", "098450 12345" → "+919845012345"; anything else → null.
create or replace function public.normalize_in_phone(p text)
returns text language plpgsql immutable as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10);
  elsif length(d) = 11 and left(d, 1) = '0' then d := right(d, 10);
  end if;
  if d ~ '^[6-9][0-9]{9}$' then return '+91' || d; end if;
  return null;
end $$;

-- Serialise an order with items (cart order), table and feedback.
create or replace function public.order_json(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o)
    || jsonb_build_object(
         'items', coalesce((select jsonb_agg(to_jsonb(oi) order by oi.position, oi.id) from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
         'table', (select jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label, 'area', t.area) from public.dining_tables t where t.id = o.table_id),
         'feedback', (select jsonb_build_object('rating', f.rating, 'comment', f.comment, 'created_at', f.created_at) from public.feedback f where f.order_id = o.id)
       )
  from public.orders o
  where o.id = p_order_id
$$;

-- Price one cart line from the live menu (never from the client). Shared by place_order and add_order_items.
create or replace function public._price_line(
  p_restaurant_id uuid,
  p_item jsonb,
  out menu_item_id uuid,
  out name text,
  out unit_price numeric(10,2),
  out quantity integer,
  out is_veg boolean,
  out options jsonb,
  out note text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_menu public.menu_items%rowtype;
  v_opt jsonb;
  v_group jsonb;
  v_choice jsonb;
begin
  quantity := coalesce((p_item->>'quantity')::int, 1);
  if quantity < 1 or quantity > 50 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;
  select * into v_menu from public.menu_items
    where id = (p_item->>'menu_item_id')::uuid and restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'One of the dishes is no longer on the menu' using errcode = 'P0001';
  end if;
  if not v_menu.is_available then
    raise exception '% is sold out right now', v_menu.name using errcode = 'P0001';
  end if;

  unit_price := v_menu.price;
  options := '[]'::jsonb;
  for v_opt in select * from jsonb_array_elements(coalesce(p_item->'options', '[]'::jsonb)) loop
    select g into v_group from jsonb_array_elements(v_menu.option_groups) g where g->>'id' = v_opt->>'group_id';
    if v_group is null then
      raise exception 'Unknown option for %', v_menu.name using errcode = 'P0001';
    end if;
    select c into v_choice from jsonb_array_elements(v_group->'choices') c where c->>'id' = v_opt->>'choice_id';
    if v_choice is null then
      raise exception 'Unknown option choice for %', v_menu.name using errcode = 'P0001';
    end if;
    unit_price := unit_price + coalesce((v_choice->>'price_delta')::numeric, 0);
    options := options || jsonb_build_object(
      'group_id', v_group->>'id', 'group_name', v_group->>'name',
      'choice_id', v_choice->>'id', 'choice_label', v_choice->>'label',
      'price_delta', coalesce((v_choice->>'price_delta')::numeric, 0));
    v_group := null;
    v_choice := null;
  end loop;

  menu_item_id := v_menu.id;
  name := v_menu.name;
  is_veg := v_menu.is_veg;
  note := nullif(trim(coalesce(p_item->>'note', '')), '');
end $$;

revoke all on function public._price_line(uuid, jsonb) from public;

-- place_order v3: + phone / marketing consent / idempotency key.
drop function if exists public.place_order(text, uuid, text, public.payment_method, text, jsonb);

create or replace function public.place_order(
  p_table_code text,
  p_guest_session_id uuid,
  p_guest_name text,
  p_payment_method public.payment_method,
  p_note text,
  p_items jsonb,
  p_phone text default null,
  p_marketing_consent boolean default false,
  p_consent_text text default null,
  p_client_ref uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.dining_tables%rowtype;
  v_rest public.restaurants%rowtype;
  v_customer public.customers%rowtype;
  v_existing uuid;
  v_order_id uuid;
  v_number integer;
  v_item jsonb;
  v_line record;
  v_phone text;
  v_name text := nullif(trim(coalesce(p_guest_name, '')), '');
  v_pos integer := 0;
  v_subtotal numeric(10,2) := 0;
  v_service numeric(10,2);
  v_tax numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the order' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many items in one order' using errcode = 'P0001';
  end if;

  select * into v_table from public.dining_tables where code = upper(p_table_code) and is_active;
  if not found then
    raise exception 'This table QR is not active. Please ask the staff.' using errcode = 'P0001';
  end if;
  -- Row lock serialises orders per restaurant (order numbers + the idempotency check below).
  select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;

  -- Same checkout submitted twice (double tap, retry after a dropped connection) → same order.
  if p_client_ref is not null then
    select id into v_existing from public.orders where restaurant_id = v_rest.id and client_ref = p_client_ref;
    if v_existing is not null then
      return public.order_json(v_existing);
    end if;
  end if;

  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'upi' and not v_rest.accepts_upi then
    raise exception 'UPI payment is not available here.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'counter' and not v_rest.accepts_counter then
    raise exception 'Pay at counter is not available here.' using errcode = 'P0001';
  end if;

  -- Customer profile (Growth and Premium). A phone number alone never means marketing consent.
  if nullif(trim(coalesce(p_phone, '')), '') is not null and v_rest.plan <> 'starter' then
    v_phone := public.normalize_in_phone(p_phone);
    if v_phone is null then
      raise exception 'Please enter a valid 10-digit Indian mobile number, or leave it empty.' using errcode = 'P0001';
    end if;
    insert into public.customers (restaurant_id, phone, name)
    values (v_rest.id, v_phone, v_name)
    on conflict (restaurant_id, phone) do update
      set last_seen_at = now(), name = coalesce(excluded.name, public.customers.name)
    returning * into v_customer;

    if coalesce(p_marketing_consent, false) and v_rest.marketing_consent_enabled and not v_customer.marketing_consent then
      update public.customers
        set marketing_consent = true, consent_at = now(), consent_revoked_at = null
        where id = v_customer.id;
      insert into public.consent_events (restaurant_id, customer_id, action, source, consent_text)
      values (v_rest.id, v_customer.id, 'granted', 'qr_checkout', left(p_consent_text, 500));
    end if;
  end if;

  v_number := v_rest.next_order_number;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rest.id;

  insert into public.orders (restaurant_id, table_id, order_number, guest_session_id, guest_name, payment_method, note, customer_id, client_ref)
  values (v_rest.id, v_table.id, v_number, p_guest_session_id, v_name, p_payment_method,
          nullif(trim(coalesce(p_note, '')), ''), v_customer.id, p_client_ref)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public._price_line(v_rest.id, v_item);
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (v_order_id, v_line.menu_item_id, v_line.name, v_line.unit_price, v_line.quantity, v_line.is_veg, v_line.options, v_line.note,
            round(v_line.unit_price * v_line.quantity, 2), v_pos, 1);
    v_pos := v_pos + 1;
    v_subtotal := v_subtotal + round(v_line.unit_price * v_line.quantity, 2);
  end loop;

  v_service := round(v_subtotal * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_subtotal + v_service) * v_rest.tax_rate / 100, 2);
  update public.orders
    set subtotal = v_subtotal, service_charge = v_service, tax_amount = v_tax, total = v_subtotal + v_service + v_tax
    where id = v_order_id;

  return public.order_json(v_order_id);
end $$;

-- Add dishes to an order that is still open (not ready / served / cancelled, not yet being paid).
create or replace function public.add_order_items(p_order_id uuid, p_guest_session_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_rest public.restaurants%rowtype;
  v_item jsonb;
  v_line record;
  v_round integer;
  v_pos integer;
  v_subtotal numeric(10,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one dish' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many dishes at once' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id and guest_session_id = p_guest_session_id for update;
  if not found then
    raise exception 'We could not find this order on this phone.' using errcode = 'P0001';
  end if;
  if v_order.status not in ('placed', 'accepted', 'preparing') then
    raise exception 'This order is already %. Place a new order for anything else.', v_order.status using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'pending' then
    raise exception 'This order is already being paid. Place a new order for anything else.' using errcode = 'P0001';
  end if;

  select * into v_rest from public.restaurants where id = v_order.restaurant_id;
  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;

  select coalesce(max(round), 1) + 1, coalesce(max(position), -1) + 1 into v_round, v_pos
    from public.order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public._price_line(v_rest.id, v_item);
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (p_order_id, v_line.menu_item_id, v_line.name, v_line.unit_price, v_line.quantity, v_line.is_veg, v_line.options, v_line.note,
            round(v_line.unit_price * v_line.quantity, 2), v_pos, v_round);
    v_pos := v_pos + 1;
  end loop;

  select coalesce(sum(line_total), 0) into v_subtotal from public.order_items where order_id = p_order_id;
  v_service := round(v_subtotal * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_subtotal + v_service) * v_rest.tax_rate / 100, 2);
  update public.orders
    set subtotal = v_subtotal, service_charge = v_service, tax_amount = v_tax,
        total = v_subtotal + v_service + v_tax, items_added_at = now()
    where id = p_order_id;

  return public.order_json(p_order_id);
end $$;

-- The guest's own help requests (so the phone can show "a waiter is on the way").
create or replace function public.get_session_calls(p_table_code text, p_guest_session_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  from public.assistance_calls c
  join public.dining_tables t on t.id = c.table_id
  where t.code = upper(p_table_code)
    and c.guest_session_id = p_guest_session_id
    and c.created_at > now() - interval '4 hours'
$$;

-- One rating per served order (re-submitting replaces it).
create or replace function public.submit_feedback(p_order_id uuid, p_guest_session_id uuid, p_rating integer, p_comment text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_rest public.restaurants%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and guest_session_id = p_guest_session_id;
  if not found then
    raise exception 'We could not find this order on this phone.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'served' then
    raise exception 'You can rate your meal once it has been served.' using errcode = 'P0001';
  end if;
  select * into v_rest from public.restaurants where id = v_order.restaurant_id;
  if v_rest.plan = 'starter' or not v_rest.feedback_enabled then
    raise exception 'Feedback is not turned on at this restaurant.' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Pick a rating from 1 to 5.' using errcode = 'P0001';
  end if;

  insert into public.feedback (restaurant_id, order_id, customer_id, table_id, rating, comment)
  values (v_order.restaurant_id, v_order.id, v_order.customer_id, v_order.table_id, p_rating,
          nullif(trim(left(coalesce(p_comment, ''), 1000)), ''))
  on conflict (order_id) do update
    set rating = excluded.rating, comment = excluded.comment, created_at = now();

  return public.order_json(p_order_id);
end $$;

-- Unsubscribe link: look up (masked) and confirm.
create or replace function public.get_unsubscribe(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'restaurant', r.name,
    'phone', left(c.phone, 5) || ' ' || repeat('•', 5) || right(c.phone, 3),
    'subscribed', c.marketing_consent
  )
  from public.customers c join public.restaurants r on r.id = c.restaurant_id
  where c.unsubscribe_token = p_token
$$;

create or replace function public.unsubscribe_customer(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_customer public.customers%rowtype;
begin
  select * into v_customer from public.customers where unsubscribe_token = p_token for update;
  if not found then
    raise exception 'This unsubscribe link is not valid.' using errcode = 'P0001';
  end if;
  if v_customer.marketing_consent then
    update public.customers set marketing_consent = false, consent_revoked_at = now() where id = v_customer.id;
    insert into public.consent_events (restaurant_id, customer_id, action, source)
    values (v_customer.restaurant_id, v_customer.id, 'revoked', 'unsubscribe_link');
  end if;
  return public.get_unsubscribe(p_token);
end $$;

-- Staff record a customer's request to stop messages (staff can never grant consent).
create or replace function public.revoke_marketing_consent(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer public.customers%rowtype;
begin
  select * into v_customer from public.customers
    where id = p_customer_id and restaurant_id = public.current_staff_restaurant() for update;
  if not found then
    raise exception 'Customer not found' using errcode = 'P0001';
  end if;
  if v_customer.marketing_consent then
    update public.customers set marketing_consent = false, consent_revoked_at = now() where id = v_customer.id;
    insert into public.consent_events (restaurant_id, customer_id, action, source)
    values (v_customer.restaurant_id, v_customer.id, 'revoked', 'staff');
  end if;
end $$;

-- Customer list with visit / spend aggregates. Runs as the caller, so staff RLS applies.
create or replace function public.customer_list(p_restaurant_id uuid)
returns table (
  id uuid,
  phone text,
  name text,
  marketing_consent boolean,
  consent_at timestamptz,
  consent_revoked_at timestamptz,
  unsubscribe_token uuid,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  orders_count bigint,
  visits bigint,
  total_spent numeric,
  last_order_at timestamptz,
  avg_rating numeric
)
language sql stable security invoker set search_path = public as $$
  select
    c.id, c.phone, c.name, c.marketing_consent, c.consent_at, c.consent_revoked_at, c.unsubscribe_token,
    c.first_seen_at, c.last_seen_at,
    count(o.id) filter (where o.status <> 'cancelled'),
    count(distinct o.guest_session_id) filter (where o.status <> 'cancelled'),
    coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0),
    max(o.placed_at) filter (where o.status <> 'cancelled'),
    (select round(avg(f.rating)::numeric, 1) from public.feedback f where f.customer_id = c.id)
  from public.customers c
  left join public.orders o on o.customer_id = c.id
  where c.restaurant_id = p_restaurant_id
  group by c.id
$$;

-- Grants
revoke all on function public.place_order(text, uuid, text, public.payment_method, text, jsonb, text, boolean, text, uuid) from public;
grant execute on function public.place_order(text, uuid, text, public.payment_method, text, jsonb, text, boolean, text, uuid) to anon, authenticated, service_role;
revoke all on function public.add_order_items(uuid, uuid, jsonb) from public;
grant execute on function public.add_order_items(uuid, uuid, jsonb) to anon, authenticated, service_role;
revoke all on function public.get_session_calls(text, uuid) from public;
grant execute on function public.get_session_calls(text, uuid) to anon, authenticated, service_role;
revoke all on function public.submit_feedback(uuid, uuid, integer, text) from public;
grant execute on function public.submit_feedback(uuid, uuid, integer, text) to anon, authenticated, service_role;
revoke all on function public.get_unsubscribe(uuid) from public;
grant execute on function public.get_unsubscribe(uuid) to anon, authenticated, service_role;
revoke all on function public.unsubscribe_customer(uuid) from public;
grant execute on function public.unsubscribe_customer(uuid) to anon, authenticated, service_role;
revoke all on function public.revoke_marketing_consent(uuid) from public;
grant execute on function public.revoke_marketing_consent(uuid) to authenticated, service_role;
revoke all on function public.customer_list(uuid) from public;
grant execute on function public.customer_list(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS for the new tables (staff read their own restaurant; all writes go through RPCs)
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.consent_events enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "customers staff read" on public.customers;
create policy "customers staff read" on public.customers for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "consent events staff read" on public.consent_events;
create policy "consent events staff read" on public.consent_events for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "feedback staff read" on public.feedback;
create policy "feedback staff read" on public.feedback for select using (restaurant_id = public.current_staff_restaurant());

-- Staff dashboards get feedback live.
do $$ begin
  alter publication supabase_realtime add table public.feedback;
exception when duplicate_object then null; end $$;

-- ---------- seed.sql (demo data + demo login) ----------
-- Restaurant OS — demo data. Safe to re-run.
-- Loads "Saffron Lane Café" with 8 tables and a full menu, then creates the demo login
-- (demo@restaurantos.app / demo1234) and links it to the restaurant as owner.

-- ---------------------------------------------------------------------------
-- Restaurant
-- ---------------------------------------------------------------------------
insert into public.restaurants (id, slug, name, tagline, logo_url, cover_url, address, phone, upi_id, upi_payee_name, tax_rate, service_charge_rate, gstin)
values (
  'a0000000-0000-4000-8000-000000000001',
  'saffron-lane',
  'Saffron Lane Café',
  'Small plates, big flavours. Since 2019.',
  null,
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=75',
  '14 Saffron Lane, Koramangala, Bengaluru 560034',
  '+91 98450 12345',
  'saffronlane@upi',
  'Saffron Lane Cafe',
  5.00,
  0.00,
  '29ABCDE1234F1Z5'
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, cover_url = excluded.cover_url,
  address = excluded.address, phone = excluded.phone, upi_id = excluded.upi_id,
  upi_payee_name = excluded.upi_payee_name, tax_rate = excluded.tax_rate, gstin = excluded.gstin;

-- ---------------------------------------------------------------------------
-- Tables (codes DEMO1..DEMO8 so the homepage demo QR is predictable)
-- ---------------------------------------------------------------------------
insert into public.dining_tables (id, restaurant_id, code, label, area, seats, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'DEMO1', 'Table 1', 'Indoor Window', 4, 1),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'DEMO2', 'Table 2', 'Indoor', 2, 2),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'DEMO3', 'Table 3', 'Indoor', 4, 3),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'DEMO4', 'Table 4', 'Garden', 6, 4),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'DEMO5', 'Table 5', 'Garden', 4, 5),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'DEMO6', 'Table 6', 'Terrace', 4, 6),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'DEMO7', 'Table 7', 'Terrace', 2, 7),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'DEMO8', 'Table 8', 'Private Booth', 8, 8)
on conflict (code) do update set label = excluded.label, area = excluded.area, seats = excluded.seats, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Menu categories
-- ---------------------------------------------------------------------------
insert into public.menu_categories (id, restaurant_id, name, description, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Small Plates', 'Start light, share freely', 1),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Curries & Mains', 'Slow-cooked, served hot', 2),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Breads & Rice', 'Fresh from the tandoor', 3),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Café Classics', 'Pizzas, pastas, burgers', 4),
  ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Desserts', 'Save room', 5),
  ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Drinks', 'Hot, cold and fizzy', 6)
on conflict (id) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Menu items (replace the demo restaurant's items wholesale)
-- ---------------------------------------------------------------------------
delete from public.menu_items where restaurant_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.menu_items (restaurant_id, category_id, name, description, price, image_url, is_veg, badges, option_groups, sort_order, prep_minutes) values
  -- Small Plates
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Paneer Tikka', 'Char-grilled cottage cheese, mint chutney, pickled onions.', 320, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=75', true, '{bestseller}', '[]', 1, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Murgh Malai Tikka', 'Cream-and-cardamom marinated chicken, finished in the tandoor.', 440, 'https://images.unsplash.com/photo-1610057099431-d73a1c9d2f2f?auto=format&fit=crop&w=900&q=75', false, '{chef_special}', '[]', 2, 18),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Crispy Corn Chaat', 'Fried sweet corn, chaat masala, lime, fresh coriander.', 260, 'https://images.unsplash.com/photo-1606756790138-261d2b21cd75?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 3, 10),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Punjabi Samosa (2 pc)', 'Hand-folded, spiced potato and peas, tamarind chutney.', 120, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=75', true, '{bestseller}', '[]', 4, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Chicken 65', 'Crisp, fiery, curry-leaf tempered. Not for the faint of heart.', 380, 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=900&q=75', false, '{spicy}', '[]', 5, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Veg Momos (8 pc)', 'Cabbage, carrot and paneer dumplings with schezwan dip.', 220, 'https://images.unsplash.com/photo-1626776876729-bab4369a5a5a?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"style","name":"Style","required":true,"multi":false,"choices":[{"id":"steamed","label":"Steamed","price_delta":0},{"id":"fried","label":"Fried","price_delta":30}]}]', 6, 12),

  -- Curries & Mains
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Emerald Dal Makhani', 'Black lentils simmered overnight, finished with butter and cream.', 380, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=900&q=75', true, '{bestseller}',
    '[{"id":"portion","name":"Portion","required":true,"multi":false,"choices":[{"id":"half","label":"Half","price_delta":-120},{"id":"full","label":"Full","price_delta":0}]}]', 1, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Butter Chicken', 'Tandoori chicken in a silky tomato-butter gravy. The one everyone orders.', 460, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=75', false, '{bestseller}',
    '[{"id":"spice","name":"Spice level","required":true,"multi":false,"choices":[{"id":"mild","label":"Mild","price_delta":0},{"id":"medium","label":"Medium","price_delta":0},{"id":"hot","label":"Hot","price_delta":0}]}]', 2, 20),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Paneer Butter Masala', 'Soft paneer in a rich cashew-tomato gravy.', 390, 'https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"spice","name":"Spice level","required":true,"multi":false,"choices":[{"id":"mild","label":"Mild","price_delta":0},{"id":"medium","label":"Medium","price_delta":0},{"id":"hot","label":"Hot","price_delta":0}]}]', 3, 18),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Chole Bhature', 'Spiced chickpeas with two fluffy bhature, pickle and onions.', 240, 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 4, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Hyderabadi Chicken Biryani', 'Dum-cooked basmati, saffron, fried onions. Served with raita and salan.', 420, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=900&q=75', false, '{spicy,chef_special}',
    '[{"id":"extras","name":"Extras","required":false,"multi":true,"choices":[{"id":"egg","label":"Boiled egg","price_delta":30},{"id":"extra-raita","label":"Extra raita","price_delta":40}]}]', 5, 25),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Saffron Veg Thali', 'Dal, seasonal sabzi, paneer, rice, two rotis, raita, papad and sweet.', 350, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 6, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Pav Bhaji', 'Mumbai-style mashed vegetables, buttered pav, lime and onions.', 220, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"extras","name":"Extras","required":false,"multi":true,"choices":[{"id":"extra-pav","label":"Extra pav (2)","price_delta":30},{"id":"cheese","label":"Cheese","price_delta":40}]}]', 7, 12),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Masala Dosa', 'Crisp fermented crêpe, potato masala, sambar and two chutneys.', 180, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=900&q=75', true, '{bestseller}', '[]', 8, 12),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'Idli Sambar (3 pc)', 'Steamed rice cakes with sambar and coconut chutney.', 140, 'https://images.unsplash.com/photo-1589301773859-bb024d3ad558?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 9, 8),

  -- Breads & Rice
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Butter Naan', 'Leavened, tandoor-blistered, brushed with butter.', 60, 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 1, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Garlic Naan', 'With chopped garlic and coriander.', 70, 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 2, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Tandoori Roti', 'Whole-wheat, no butter.', 40, null, true, '{}', '[]', 3, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Jeera Rice', 'Basmati tempered with cumin and ghee.', 180, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 4, 10),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Veg Hakka Noodles', 'Wok-tossed with vegetables and soy.', 230, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 5, 12),

  -- Café Classics
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Margherita Pizza', 'San Marzano tomato, fior di latte, basil. 10 inch.', 380, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=75', true, '{bestseller}',
    '[{"id":"crust","name":"Crust","required":true,"multi":false,"choices":[{"id":"thin","label":"Thin crust","price_delta":0},{"id":"cheese-burst","label":"Cheese burst","price_delta":80}]}]', 1, 18),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Penne Alfredo', 'Creamy parmesan sauce, garlic, cracked pepper.', 340, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"extras","name":"Add on","required":false,"multi":true,"choices":[{"id":"mushroom","label":"Mushrooms","price_delta":50},{"id":"olives","label":"Olives","price_delta":40}]}]', 2, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Classic Chicken Burger', 'Grilled chicken, house slaw, brioche bun, fries on the side.', 290, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=75', false, '{}', '[]', 3, 15),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Peri Peri Fries', 'Skin-on fries, peri peri dust, garlic aioli.', 180, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=75', true, '{spicy}', '[]', 4, 10),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Garden Salad', 'Greens, cherry tomato, cucumber, feta, lemon dressing.', 240, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=75', true, '{new}', '[]', 5, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004', 'Tomato Basil Soup', 'Slow-roasted tomatoes, fresh basil, garlic toast.', 190, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 6, 10),

  -- Desserts
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'Gulab Jamun (2 pc)', 'Warm, cardamom-scented, in saffron syrup.', 120, 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 1, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'New York Cheesecake', 'Baked, with a berry compote.', 280, 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 2, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'Chocolate Brownie & Ice Cream', 'Warm fudge brownie, vanilla bean ice cream, chocolate sauce.', 260, 'https://images.unsplash.com/photo-1564355808539-22fda35bed7e?auto=format&fit=crop&w=900&q=75', true, '{bestseller}', '[]', 3, 8),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000005', 'Kulfi Falooda', 'Malai kulfi, rose syrup, vermicelli, basil seeds.', 180, 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 4, 5),

  -- Drinks
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Masala Chai', 'Brewed with ginger, cardamom and black pepper.', 80, 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=900&q=75', true, '{bestseller}', '[]', 1, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Cappuccino', 'Double shot, velvety milk.', 160, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 2, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Cold Coffee', 'Blended with vanilla ice cream.', 190, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"size","name":"Size","required":true,"multi":false,"choices":[{"id":"regular","label":"Regular","price_delta":0},{"id":"large","label":"Large","price_delta":40}]}]', 3, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Sweet Lassi', 'Thick, chilled, a touch of rose.', 120, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 4, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Virgin Mojito', 'Mint, lime, soda, crushed ice.', 170, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=900&q=75', true, '{}', '[]', 5, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Mango Smoothie', 'Alphonso mango, yoghurt, honey.', 200, 'https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=900&q=75', true, '{new}', '[]', 6, 5),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000006', 'Fresh Lime Soda', 'Made to order.', 90, 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=75', true, '{}',
    '[{"id":"taste","name":"Taste","required":true,"multi":false,"choices":[{"id":"sweet","label":"Sweet","price_delta":0},{"id":"salted","label":"Salted","price_delta":0},{"id":"mixed","label":"Mixed","price_delta":0}]}]', 7, 3);

-- ---------------------------------------------------------------------------
-- Plan + guest-experience settings (migration 0003)
-- ---------------------------------------------------------------------------
update public.restaurants set
  plan = 'growth',
  google_review_url = 'https://www.google.com/maps/search/?api=1&query=Saffron+Lane+Cafe+Koramangala',
  story_title = 'One lane, five years, the same dal',
  story_text = 'We opened Saffron Lane in 2019 with eight tables and a pot of dal makhani that simmers overnight. The recipe has not changed. The tables have multiplied, and so have the regulars we now know by name.',
  games_enabled = true, feedback_enabled = true, marketing_consent_enabled = true
where slug = 'saffron-lane';

-- >>> AUTH USER (SQL editor only)
-- Creates the demo login directly in auth.users. The seed script (npm run seed) does this through
-- the Admin API instead when a service role key is available.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'demo@restaurantos.app',
  extensions.crypt('demo1234', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo Manager"}'::jsonb,
  now(), now(), '', '', '', '', false, false
)
on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = now();

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  'e0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'demo@restaurantos.app',
  jsonb_build_object('sub', 'd0000000-0000-4000-8000-000000000001', 'email', 'demo@restaurantos.app', 'email_verified', true),
  'email', now(), now(), now()
)
on conflict (id) do nothing;

insert into public.staff (user_id, restaurant_id, role, display_name)
values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner', 'Demo Manager')
on conflict (user_id) do update set restaurant_id = excluded.restaurant_id, role = excluded.role, display_name = excluded.display_name;

-- ---------- 0004_add_items_idempotency.sql ----------
-- Restaurant OS — 0004: duplicate protection for "add dishes to this order".
-- If the guest taps "Add to order" again because the first response was lost, the retry carries the
-- same client_ref and the dishes are not added a second time.

alter table public.orders add column if not exists last_add_ref uuid;

drop function if exists public.add_order_items(uuid, uuid, jsonb);

create or replace function public.add_order_items(p_order_id uuid, p_guest_session_id uuid, p_items jsonb, p_client_ref uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_rest public.restaurants%rowtype;
  v_item jsonb;
  v_line record;
  v_round integer;
  v_pos integer;
  v_subtotal numeric(10,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one dish' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many dishes at once' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id and guest_session_id = p_guest_session_id for update;
  if not found then
    raise exception 'We could not find this order on this phone.' using errcode = 'P0001';
  end if;

  -- Same add submitted twice → return the order as it is.
  if p_client_ref is not null and v_order.last_add_ref = p_client_ref then
    return public.order_json(p_order_id);
  end if;

  if v_order.status not in ('placed', 'accepted', 'preparing') then
    raise exception 'This order is already %. Place a new order for anything else.', v_order.status using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'pending' then
    raise exception 'This order is already being paid. Place a new order for anything else.' using errcode = 'P0001';
  end if;

  select * into v_rest from public.restaurants where id = v_order.restaurant_id;
  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;

  select coalesce(max(round), 1) + 1, coalesce(max(position), -1) + 1 into v_round, v_pos
    from public.order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public._price_line(v_rest.id, v_item);
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (p_order_id, v_line.menu_item_id, v_line.name, v_line.unit_price, v_line.quantity, v_line.is_veg, v_line.options, v_line.note,
            round(v_line.unit_price * v_line.quantity, 2), v_pos, v_round);
    v_pos := v_pos + 1;
  end loop;

  select coalesce(sum(line_total), 0) into v_subtotal from public.order_items where order_id = p_order_id;
  v_service := round(v_subtotal * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_subtotal + v_service) * v_rest.tax_rate / 100, 2);
  update public.orders
    set subtotal = v_subtotal, service_charge = v_service, tax_amount = v_tax,
        total = v_subtotal + v_service + v_tax, items_added_at = now(),
        last_add_ref = coalesce(p_client_ref, last_add_ref)
    where id = p_order_id;

  return public.order_json(p_order_id);
end $$;

revoke all on function public.add_order_items(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.add_order_items(uuid, uuid, jsonb, uuid) to anon, authenticated, service_role;

-- ---------- 0005_hindi_loyalty_analytics_integrations.sql ----------
-- Restaurant OS — 0005: Hindi menu, loyalty rewards, advanced analytics, integrations
-- (signed order webhooks for POS / middleware, WhatsApp Cloud API automation).
--
--  1. Hindi:        menu_items / menu_categories .name_hi, .description_hi
--  2. Loyalty:      loyalty_programs, loyalty_rewards, reward issued automatically when an order is served
--  3. Integrations: restaurant_integrations (webhook + WhatsApp settings), integration_events (outbox),
--                   whatsapp_messages (send log with de-duplication)
--  4. Analytics:    analytics_report() — one JSON report for any date range
--  5. Demo café:    Premium plan, loyalty switched on, Hindi menu
--
-- Premium-only features are enforced here too (loyalty trigger, webhook outbox) via restaurants.plan.

-- ---------------------------------------------------------------------------
-- 1. Hindi menu
-- ---------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists name_hi text,
  add column if not exists description_hi text;
alter table public.menu_categories
  add column if not exists name_hi text,
  add column if not exists description_hi text;

-- ---------------------------------------------------------------------------
-- 2. Loyalty
-- ---------------------------------------------------------------------------
create table if not exists public.loyalty_programs (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  enabled boolean not null default false,
  visits_required integer not null default 5 check (visits_required between 2 and 50),
  reward_text text not null default 'A free dessert of your choice' check (char_length(reward_text) between 1 and 120),
  reward_expiry_days integer not null default 60 check (reward_expiry_days between 1 and 365),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  code text not null unique,
  reward_text text not null,
  visits_at_earn integer not null,
  earned_order_id uuid references public.orders (id) on delete set null,
  earned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
create index if not exists loyalty_rewards_restaurant_idx on public.loyalty_rewards (restaurant_id, earned_at desc);
create index if not exists loyalty_rewards_customer_idx on public.loyalty_rewards (customer_id);

-- A visit = one table session (guest_session_id) with at least one served order.
create or replace function public.customer_visits(p_customer_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct guest_session_id)::int from public.orders
  where customer_id = p_customer_id and status = 'served'
$$;

create or replace function public.loyalty_on_served()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_plan text;
  v_visits integer;
  v_issued integer;
  v_code text;
begin
  if new.customer_id is null or new.status <> 'served' or old.status = 'served' then
    return new;
  end if;
  select plan into v_plan from public.restaurants where id = new.restaurant_id;
  if v_plan is distinct from 'premium' then return new; end if;
  select * into v_prog from public.loyalty_programs where restaurant_id = new.restaurant_id and enabled;
  if not found then return new; end if;

  v_visits := public.customer_visits(new.customer_id);
  select count(*) into v_issued from public.loyalty_rewards where customer_id = new.customer_id;
  if v_visits >= (v_issued + 1) * v_prog.visits_required then
    loop
      v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      exit when not exists (select 1 from public.loyalty_rewards where code = v_code);
    end loop;
    insert into public.loyalty_rewards (restaurant_id, customer_id, code, reward_text, visits_at_earn, earned_order_id, expires_at)
    values (new.restaurant_id, new.customer_id, v_code, v_prog.reward_text, v_visits, new.id,
            now() + make_interval(days => v_prog.reward_expiry_days));
  end if;
  return new;
end $$;

drop trigger if exists orders_loyalty on public.orders;
create trigger orders_loyalty after update of status on public.orders
  for each row execute function public.loyalty_on_served();

-- The guest's own loyalty card (via the customer linked to their latest order at this table).
create or replace function public.get_loyalty_status(p_table_code text, p_guest_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_customer uuid;
  v_rest uuid;
  v_plan text;
  v_prog public.loyalty_programs%rowtype;
  v_visits integer;
  v_issued integer;
begin
  select o.customer_id, o.restaurant_id into v_customer, v_rest
  from public.orders o join public.dining_tables t on t.id = o.table_id
  where t.code = upper(p_table_code) and o.guest_session_id = p_guest_session_id and o.customer_id is not null
  order by o.placed_at desc limit 1;

  if v_customer is null then
    -- Tell the guest whether a loyalty program exists, so the phone field can mention it.
    select r.plan, r.id into v_plan, v_rest from public.dining_tables t join public.restaurants r on r.id = t.restaurant_id
      where t.code = upper(p_table_code);
    select * into v_prog from public.loyalty_programs where restaurant_id = v_rest and enabled;
    return jsonb_build_object(
      'enabled', coalesce(found and v_plan = 'premium', false), 'linked', false,
      'visits_required', v_prog.visits_required, 'reward_text', v_prog.reward_text);
  end if;

  select plan into v_plan from public.restaurants where id = v_rest;
  select * into v_prog from public.loyalty_programs where restaurant_id = v_rest and enabled;
  if not found or v_plan is distinct from 'premium' then
    return jsonb_build_object('enabled', false, 'linked', true);
  end if;

  v_visits := public.customer_visits(v_customer);
  select count(*) into v_issued from public.loyalty_rewards where customer_id = v_customer;
  return jsonb_build_object(
    'enabled', true,
    'linked', true,
    'visits', v_visits,
    'visits_required', v_prog.visits_required,
    'reward_text', v_prog.reward_text,
    'next_reward_in', greatest(0, (v_issued + 1) * v_prog.visits_required - v_visits),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'reward_text', reward_text, 'expires_at', expires_at) order by earned_at desc)
      from public.loyalty_rewards
      where customer_id = v_customer and redeemed_at is null and expires_at > now()
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.redeem_loyalty_reward(p_reward_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.loyalty_rewards%rowtype;
begin
  update public.loyalty_rewards set redeemed_at = now()
    where id = p_reward_id and restaurant_id = public.current_staff_restaurant()
      and redeemed_at is null and expires_at > now()
    returning * into v_row;
  if not found then
    raise exception 'This reward is already used, has expired, or is not from this restaurant.' using errcode = 'P0001';
  end if;
  return to_jsonb(v_row);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Integrations
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_integrations (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  webhook_enabled boolean not null default false,
  webhook_url text check (webhook_url is null or webhook_url ~ '^https?://'),
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  wa_enabled boolean not null default false,
  wa_phone_number_id text,
  wa_access_token text,
  wa_language text not null default 'en',
  wa_template_welcome text,
  wa_template_winback text,
  wa_template_reward text,
  wa_template_offer text,
  winback_days integer not null default 30 check (winback_days between 7 and 365),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  event text not null,
  order_id uuid references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text
);
create index if not exists integration_events_pending_idx on public.integration_events (restaurant_id, delivered_at, next_attempt_at);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  phone text not null,
  kind text not null check (kind in ('welcome', 'winback', 'reward', 'offer', 'test')),
  template text not null,
  status text not null check (status in ('sent', 'failed')),
  wamid text,
  error text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, dedupe_key)
);
create index if not exists whatsapp_messages_restaurant_idx on public.whatsapp_messages (restaurant_id, created_at desc);

-- Outbox: one row per order event while the webhook is switched on (Premium).
create or replace function public.orders_integration_event()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_on boolean;
  v_event text;
begin
  select i.webhook_enabled and i.webhook_url is not null and r.plan = 'premium' into v_on
    from public.restaurant_integrations i join public.restaurants r on r.id = i.restaurant_id
    where i.restaurant_id = new.restaurant_id;
  if not coalesce(v_on, false) then return new; end if;

  if tg_op = 'INSERT' then
    v_event := 'order.placed';
  elsif new.items_added_at is distinct from old.items_added_at then
    v_event := 'order.items_added';
  elsif new.status is distinct from old.status then
    v_event := case when new.status = 'cancelled' then 'order.cancelled' else 'order.status_changed' end;
  elsif new.payment_status is distinct from old.payment_status then
    v_event := 'order.payment_changed';
  else
    return new;
  end if;

  insert into public.integration_events (restaurant_id, event, order_id) values (new.restaurant_id, v_event, new.id);
  return new;
end $$;

drop trigger if exists orders_integration_event on public.orders;
create trigger orders_integration_event after insert or update on public.orders
  for each row execute function public.orders_integration_event();

-- WhatsApp journeys that are due now (runs as the caller → staff RLS applies).
create or replace function public.due_whatsapp_journeys(p_restaurant_id uuid)
returns table (customer_id uuid, phone text, name text, unsubscribe_token uuid, kind text, dedupe_key text, reward_code text, reward_text text)
language sql stable security invoker set search_path = public as $$
  with cfg as (
    select * from public.restaurant_integrations where restaurant_id = p_restaurant_id
  ),
  opted as (
    select c.* from public.customers c where c.restaurant_id = p_restaurant_id and c.marketing_consent
  ),
  last_served as (
    select o.customer_id, max(o.served_at) as last_at
    from public.orders o where o.restaurant_id = p_restaurant_id and o.status = 'served' and o.customer_id is not null
    group by o.customer_id
  )
  -- welcome: opted in during the last 2 days
  select c.id, c.phone, c.name, c.unsubscribe_token, 'welcome', 'welcome:' || c.id, null::text, null::text
  from opted c, cfg
  where cfg.wa_template_welcome is not null and c.consent_at > now() - interval '2 days'
  union all
  -- win-back: last served visit older than winback_days, once per lapse
  select c.id, c.phone, c.name, c.unsubscribe_token, 'winback', 'winback:' || c.id || ':' || to_char(ls.last_at, 'YYYYMMDD'), null, null
  from opted c join last_served ls on ls.customer_id = c.id, cfg
  where cfg.wa_template_winback is not null and ls.last_at < now() - make_interval(days => cfg.winback_days)
  union all
  -- reward: an unused, unexpired reward
  select c.id, c.phone, c.name, c.unsubscribe_token, 'reward', 'reward:' || r.id, r.code, r.reward_text
  from opted c join public.loyalty_rewards r on r.customer_id = c.id, cfg
  where cfg.wa_template_reward is not null and r.redeemed_at is null and r.expires_at > now()
$$;

-- ---------------------------------------------------------------------------
-- 4. Analytics
-- ---------------------------------------------------------------------------
create or replace function public.analytics_report(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with o as (
    select * from public.orders where restaurant_id = p_restaurant_id and placed_at >= p_from and placed_at < p_to
  ),
  ok as (select * from o where status <> 'cancelled'),
  prev as (
    select * from public.orders
    where restaurant_id = p_restaurant_id and status <> 'cancelled'
      and placed_at >= p_from - (p_to - p_from) and placed_at < p_from
  ),
  items as (select oi.* from public.order_items oi join ok on ok.id = oi.order_id),
  cust as (
    select ok.customer_id,
           (select min(o2.placed_at) from public.orders o2 where o2.customer_id = ok.customer_id and o2.status <> 'cancelled') as first_ever
    from ok where ok.customer_id is not null group by ok.customer_id
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', jsonb_build_object(
      'revenue', coalesce((select sum(total) from ok), 0),
      'orders', (select count(*) from ok),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'avg_order_value', coalesce((select round(avg(total), 2) from ok), 0),
      'items_sold', coalesce((select sum(quantity) from items), 0),
      'tax', coalesce((select sum(tax_amount) from ok), 0),
      'visits', (select count(distinct guest_session_id) from ok)
    ),
    'previous', jsonb_build_object(
      'revenue', coalesce((select sum(total) from prev), 0),
      'orders', (select count(*) from prev),
      'avg_order_value', coalesce((select round(avg(total), 2) from prev), 0)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'revenue', rev, 'orders', n) order by d)
      from (select (placed_at at time zone 'Asia/Kolkata')::date as d, sum(total) as rev, count(*) as n from ok group by 1) x
    ), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'orders', n))
      from (
        select extract(isodow from placed_at at time zone 'Asia/Kolkata')::int as dow,
               extract(hour from placed_at at time zone 'Asia/Kolkata')::int as hr,
               count(*) as n
        from ok group by 1, 2
      ) x
    ), '[]'::jsonb),
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'revenue', r) order by q desc, r desc)
      from (select name, sum(quantity) as q, sum(line_total) as r from items group by name) x
    ), '[]'::jsonb),
    'payments', jsonb_build_object(
      'upi', coalesce((select sum(total) from ok where payment_method = 'upi'), 0),
      'counter', coalesce((select sum(total) from ok where payment_method = 'counter'), 0),
      'unpaid', coalesce((select sum(total) from ok where payment_status in ('pending', 'claimed')), 0)
    ),
    'service', jsonb_build_object(
      'avg_accept_minutes', (select round(avg(extract(epoch from accepted_at - placed_at) / 60)::numeric, 1) from ok where accepted_at is not null),
      'avg_ready_minutes', (select round(avg(extract(epoch from ready_at - placed_at) / 60)::numeric, 1) from ok where ready_at is not null),
      'avg_serve_minutes', (select round(avg(extract(epoch from served_at - placed_at) / 60)::numeric, 1) from ok where served_at is not null)
    ),
    'customers', jsonb_build_object(
      'identified', (select count(*) from cust),
      'new', (select count(*) from cust where first_ever >= p_from),
      'returning', (select count(*) from cust where first_ever < p_from),
      'identified_share', coalesce((select round(100.0 * count(*) filter (where customer_id is not null) / nullif(count(*), 0), 1) from ok), 0)
    ),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('label', t.label, 'area', t.area, 'orders', x.n, 'revenue', x.r) order by x.r desc)
      from (select table_id, count(*) as n, sum(total) as r from ok group by table_id) x
      join public.dining_tables t on t.id = x.table_id
    ), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'average', (select round(avg(f.rating)::numeric, 1) from public.feedback f join ok on ok.id = f.order_id),
      'count', (select count(*) from public.feedback f join ok on ok.id = f.order_id)
    ),
    'loyalty', jsonb_build_object(
      'earned', (select count(*) from public.loyalty_rewards where restaurant_id = p_restaurant_id and earned_at >= p_from and earned_at < p_to),
      'redeemed', (select count(*) from public.loyalty_rewards where restaurant_id = p_restaurant_id and redeemed_at >= p_from and redeemed_at < p_to)
    ),
    'whatsapp', jsonb_build_object(
      'sent', (select count(*) from public.whatsapp_messages where restaurant_id = p_restaurant_id and status = 'sent' and created_at >= p_from and created_at < p_to),
      'failed', (select count(*) from public.whatsapp_messages where restaurant_id = p_restaurant_id and status = 'failed' and created_at >= p_from and created_at < p_to)
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.customer_visits(uuid) from public;
grant execute on function public.customer_visits(uuid) to authenticated, service_role;
revoke all on function public.get_loyalty_status(text, uuid) from public;
grant execute on function public.get_loyalty_status(text, uuid) to anon, authenticated, service_role;
revoke all on function public.redeem_loyalty_reward(uuid) from public;
grant execute on function public.redeem_loyalty_reward(uuid) to authenticated, service_role;
revoke all on function public.due_whatsapp_journeys(uuid) from public;
grant execute on function public.due_whatsapp_journeys(uuid) to authenticated, service_role;
revoke all on function public.analytics_report(uuid, timestamptz, timestamptz) from public;
grant execute on function public.analytics_report(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.restaurant_integrations enable row level security;
alter table public.integration_events enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "loyalty programs staff read" on public.loyalty_programs;
create policy "loyalty programs staff read" on public.loyalty_programs for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "loyalty programs managers write" on public.loyalty_programs;
create policy "loyalty programs managers write" on public.loyalty_programs for insert
  with check (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));
drop policy if exists "loyalty programs managers update" on public.loyalty_programs;
create policy "loyalty programs managers update" on public.loyalty_programs for update
  using (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));

drop policy if exists "loyalty rewards staff read" on public.loyalty_rewards;
create policy "loyalty rewards staff read" on public.loyalty_rewards for select using (restaurant_id = public.current_staff_restaurant());

-- Credentials: owners and managers only.
drop policy if exists "integrations managers read" on public.restaurant_integrations;
create policy "integrations managers read" on public.restaurant_integrations for select
  using (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));
drop policy if exists "integrations managers insert" on public.restaurant_integrations;
create policy "integrations managers insert" on public.restaurant_integrations for insert
  with check (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));
drop policy if exists "integrations managers update" on public.restaurant_integrations;
create policy "integrations managers update" on public.restaurant_integrations for update
  using (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));

drop policy if exists "integration events staff read" on public.integration_events;
create policy "integration events staff read" on public.integration_events for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "integration events managers update" on public.integration_events;
create policy "integration events managers update" on public.integration_events for update
  using (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));
drop policy if exists "integration events managers insert" on public.integration_events;
create policy "integration events managers insert" on public.integration_events for insert
  with check (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));

drop policy if exists "whatsapp messages staff read" on public.whatsapp_messages;
create policy "whatsapp messages staff read" on public.whatsapp_messages for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "whatsapp messages managers insert" on public.whatsapp_messages;
create policy "whatsapp messages managers insert" on public.whatsapp_messages for insert
  with check (restaurant_id = public.current_staff_restaurant() and public.current_staff_role() in ('owner', 'manager'));

do $$ begin
  alter publication supabase_realtime add table public.loyalty_rewards;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. Demo café: Premium, loyalty on, Hindi menu
-- ---------------------------------------------------------------------------
update public.restaurants set plan = 'premium' where slug = 'saffron-lane';

insert into public.loyalty_programs (restaurant_id, enabled, visits_required, reward_text, reward_expiry_days)
select id, true, 5, 'A free dessert of your choice', 60 from public.restaurants where slug = 'saffron-lane'
on conflict (restaurant_id) do nothing;

update public.menu_categories c set name_hi = v.n, description_hi = v.d
from (values
  ('Small Plates', 'छोटी प्लेटें', 'हल्की शुरुआत, मिल-बाँटकर खाइए'),
  ('Curries & Mains', 'करी और मेन कोर्स', 'धीमी आँच पर पका, गरमागरम परोसा'),
  ('Breads & Rice', 'रोटी और चावल', 'सीधे तंदूर से'),
  ('Café Classics', 'कैफ़े क्लासिक्स', 'पिज़्ज़ा, पास्ता, बर्गर'),
  ('Desserts', 'मिठाइयाँ', 'थोड़ी जगह बचाकर रखिए'),
  ('Drinks', 'पेय', 'गरम, ठंडे और सोडा वाले')
) as v(en, n, d)
where c.name = v.en and c.restaurant_id = (select id from public.restaurants where slug = 'saffron-lane');

update public.menu_items m set name_hi = v.n, description_hi = v.d
from (values
  ('Paneer Tikka', 'पनीर टिक्का', 'तंदूर में सिका पनीर, पुदीने की चटनी, सिरके वाले प्याज़।'),
  ('Murgh Malai Tikka', 'मुर्ग मलाई टिक्का', 'मलाई और इलायची में मैरिनेट चिकन, तंदूर में पका।'),
  ('Crispy Corn Chaat', 'क्रिस्पी कॉर्न चाट', 'तले हुए स्वीट कॉर्न, चाट मसाला, नींबू, हरा धनिया।'),
  ('Punjabi Samosa (2 pc)', 'पंजाबी समोसा (2 पीस)', 'हाथ से भरे, मसालेदार आलू-मटर, इमली की चटनी।'),
  ('Chicken 65', 'चिकन 65', 'कुरकुरा, तीखा, करी पत्ते का तड़का।'),
  ('Veg Momos (8 pc)', 'वेज मोमोज़ (8 पीस)', 'पत्तागोभी, गाजर और पनीर के मोमोज़, शेज़वान डिप के साथ।'),
  ('Emerald Dal Makhani', 'दाल मखनी', 'रात भर पकी काली दाल, मक्खन और क्रीम के साथ।'),
  ('Butter Chicken', 'बटर चिकन', 'मक्खनी टमाटर ग्रेवी में तंदूरी चिकन।'),
  ('Paneer Butter Masala', 'पनीर बटर मसाला', 'काजू-टमाटर की गाढ़ी ग्रेवी में मुलायम पनीर।'),
  ('Chole Bhature', 'छोले भटूरे', 'मसालेदार छोले, दो फूले भटूरे, अचार और प्याज़।'),
  ('Hyderabadi Chicken Biryani', 'हैदराबादी चिकन बिरयानी', 'दम पर पका बासमती, केसर, तले प्याज़; रायता और सालन के साथ।'),
  ('Saffron Veg Thali', 'केसर वेज थाली', 'दाल, मौसमी सब्ज़ी, पनीर, चावल, दो रोटी, रायता, पापड़ और मिठाई।'),
  ('Pav Bhaji', 'पाव भाजी', 'मुंबई स्टाइल भाजी, मक्खन वाले पाव, नींबू और प्याज़।'),
  ('Masala Dosa', 'मसाला डोसा', 'कुरकुरा डोसा, आलू मसाला, सांभर और दो चटनियाँ।'),
  ('Idli Sambar (3 pc)', 'इडली सांभर (3 पीस)', 'भाप में पकी इडली, सांभर और नारियल चटनी।'),
  ('Butter Naan', 'बटर नान', 'तंदूर में सिका, मक्खन लगा नान।'),
  ('Garlic Naan', 'गार्लिक नान', 'कटे लहसुन और धनिये के साथ।'),
  ('Tandoori Roti', 'तंदूरी रोटी', 'गेहूँ की, बिना मक्खन।'),
  ('Jeera Rice', 'जीरा राइस', 'जीरे और घी के तड़के वाला बासमती।'),
  ('Veg Hakka Noodles', 'वेज हक्का नूडल्स', 'सब्ज़ियों और सोया सॉस के साथ कड़ाही में भुने।'),
  ('Margherita Pizza', 'मार्गेरिटा पिज़्ज़ा', 'टमाटर सॉस, मोज़रेला, तुलसी। 10 इंच।'),
  ('Penne Alfredo', 'पेने अल्फ़्रेडो', 'क्रीमी पार्मेज़ान सॉस, लहसुन, काली मिर्च।'),
  ('Classic Chicken Burger', 'क्लासिक चिकन बर्गर', 'ग्रिल्ड चिकन, कोलस्लॉ, ब्रियोश बन, साथ में फ्राइज़।'),
  ('Peri Peri Fries', 'पेरी पेरी फ्राइज़', 'छिलके वाले फ्राइज़, पेरी पेरी मसाला, गार्लिक मेयो।'),
  ('Garden Salad', 'गार्डन सलाद', 'हरी पत्तियाँ, चेरी टमाटर, खीरा, फ़ेटा, नींबू ड्रेसिंग।'),
  ('Tomato Basil Soup', 'टोमैटो बेसिल सूप', 'भुने टमाटर, ताज़ी तुलसी, गार्लिक टोस्ट।'),
  ('Gulab Jamun (2 pc)', 'गुलाब जामुन (2 पीस)', 'गरम, इलायची वाले, केसरिया चाशनी में।'),
  ('New York Cheesecake', 'न्यूयॉर्क चीज़केक', 'बेक्ड, बेरी कॉम्पोट के साथ।'),
  ('Chocolate Brownie & Ice Cream', 'चॉकलेट ब्राउनी और आइसक्रीम', 'गरम ब्राउनी, वनीला आइसक्रीम, चॉकलेट सॉस।'),
  ('Kulfi Falooda', 'कुल्फ़ी फ़ालूदा', 'मलाई कुल्फ़ी, गुलाब शरबत, सेवइयाँ, तुलसी के बीज।'),
  ('Masala Chai', 'मसाला चाय', 'अदरक, इलायची और काली मिर्च वाली।'),
  ('Cappuccino', 'कैपुचीनो', 'डबल शॉट, झागदार दूध।'),
  ('Cold Coffee', 'कोल्ड कॉफ़ी', 'वनीला आइसक्रीम के साथ ब्लेंड की हुई।'),
  ('Sweet Lassi', 'मीठी लस्सी', 'गाढ़ी, ठंडी, गुलाब की हल्की खुशबू।'),
  ('Virgin Mojito', 'वर्जिन मोहितो', 'पुदीना, नींबू, सोडा, कुटी बर्फ़।'),
  ('Mango Smoothie', 'मैंगो स्मूदी', 'अल्फ़ांसो आम, दही, शहद।'),
  ('Fresh Lime Soda', 'फ्रेश लाइम सोडा', 'ताज़ा बनाया हुआ।')
) as v(en, n, d)
where m.name = v.en and m.restaurant_id = (select id from public.restaurants where slug = 'saffron-lane');

-- Done. Check: select count(*) from public.menu_items;  -- expect 37

-- ---------- 0006_pos_inventory_finance_staff.sql ----------
-- Restaurant OS — 0006: counter POS & billing, takeaway, tables & reservations, inventory & purchasing,
-- expenses & cash close, coupons / happy hours / gift cards, menu availability, staff invites,
-- attendance and audit log.
--
-- Built independently from scratch (no third-party code), to cover the feature set of open-source
-- restaurant POS systems such as Nodedr OrderRestro, on top of Restaurant OS's existing data model.

-- ===========================================================================
-- 0. Helpers
-- ===========================================================================
create or replace function public.is_staff_manager()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() in ('owner', 'manager'), false)
$$;

-- Is a time window open at p_at (IST)? null bounds = always; windows may cross midnight.
create or replace function public.window_open(p_from time, p_until time, p_days integer[], p_at timestamptz default now())
returns boolean
language sql stable set search_path = public as $$
  select (p_days is null or cardinality(p_days) = 0 or extract(isodow from p_at at time zone 'Asia/Kolkata')::int = any (p_days))
     and (p_from is null or p_until is null or
          case when p_from <= p_until
               then (p_at at time zone 'Asia/Kolkata')::time between p_from and p_until
               else (p_at at time zone 'Asia/Kolkata')::time >= p_from or (p_at at time zone 'Asia/Kolkata')::time <= p_until
          end)
$$;

-- ===========================================================================
-- 1. Restaurant settings, menu availability, HSN codes
-- ===========================================================================
alter table public.restaurants
  add column if not exists takeaway_enabled boolean not null default false,
  add column if not exists takeaway_prep_minutes integer not null default 20,
  add column if not exists reservations_enabled boolean not null default false,
  add column if not exists reservation_minutes integer not null default 90,
  add column if not exists open_time time not null default '11:00',
  add column if not exists close_time time not null default '23:00',
  add column if not exists next_bill_number integer not null default 1;

alter table public.menu_categories
  add column if not exists available_from time,
  add column if not exists available_until time,
  add column if not exists available_days integer[];

alter table public.menu_items add column if not exists hsn_code text;

-- ===========================================================================
-- 2. Orders: takeaway, POS, discounts, bills, stock
-- ===========================================================================
alter table public.orders alter column table_id drop not null;
alter table public.orders
  add column if not exists order_type text not null default 'dine_in',
  add column if not exists source text not null default 'qr',
  add column if not exists pickup_at timestamptz,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists discount_reason text,
  add column if not exists coupon_code text,
  add column if not exists bill_id uuid,
  add column if not exists placed_by uuid references public.staff (id) on delete set null,
  add column if not exists stock_deducted boolean not null default false;

do $$ begin
  alter table public.orders add constraint orders_type_check check (order_type in ('dine_in', 'takeaway'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_source_check check (source in ('qr', 'pos', 'online'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_dine_in_table check (order_type <> 'dine_in' or table_id is not null);
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- 3. Promotions: coupons, happy hours, gift cards
-- ===========================================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  description text,
  kind text not null check (kind in ('percent', 'flat')),
  value numeric(10,2) not null check (value > 0),
  min_order numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  valid_from timestamptz,
  valid_until timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, code),
  check (kind <> 'percent' or value <= 100)
);

create table if not exists public.happy_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  days integer[] not null default '{1,2,3,4,5,6,7}',
  start_time time not null,
  end_time time not null,
  percent numeric(5,2) not null check (percent > 0 and percent <= 90),
  category_ids uuid[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code text not null unique,
  initial_value numeric(10,2) not null check (initial_value > 0),
  balance numeric(10,2) not null check (balance >= 0),
  issued_to_name text,
  issued_to_phone text,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards (id) on delete cascade,
  amount numeric(10,2) not null,
  bill_id uuid,
  note text,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 4. Pricing engine shared by QR, takeaway, POS orders and quotes
-- ===========================================================================
create or replace function public._price_order(p_rest_id uuid, p_items jsonb, p_coupon text, p_at timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rest public.restaurants%rowtype;
  v_item jsonb;
  v_line record;
  v_cat public.menu_categories%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_sub numeric(10,2) := 0;
  v_line_total numeric(10,2);
  v_pct numeric;
  v_hh_name text;
  v_hh numeric(10,2) := 0;
  v_hh_names text[] := '{}';
  v_c public.coupons%rowtype;
  v_coupon numeric(10,2) := 0;
  v_err text;
  v_base numeric(10,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
begin
  select * into v_rest from public.restaurants where id = p_rest_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_line from public._price_line(p_rest_id, v_item);
    select c.* into v_cat from public.menu_categories c join public.menu_items m on m.category_id = c.id where m.id = v_line.menu_item_id;
    if not v_cat.is_active or not public.window_open(v_cat.available_from, v_cat.available_until, v_cat.available_days, p_at) then
      raise exception '% is not available at this time.', v_line.name using errcode = 'P0001';
    end if;
    v_line_total := round(v_line.unit_price * v_line.quantity, 2);

    v_pct := null;
    v_hh_name := null;
    select h.percent, h.name into v_pct, v_hh_name
    from public.happy_hours h
    where h.restaurant_id = p_rest_id and h.is_active
      and public.window_open(h.start_time, h.end_time, h.days, p_at)
      and (h.category_ids is null or cardinality(h.category_ids) = 0 or v_cat.id = any (h.category_ids))
    order by h.percent desc
    limit 1;
    if v_pct is not null then
      v_hh := v_hh + round(v_line_total * v_pct / 100, 2);
      if not (v_hh_name = any (v_hh_names)) then v_hh_names := v_hh_names || v_hh_name; end if;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_line.menu_item_id, 'name', v_line.name, 'unit_price', v_line.unit_price,
      'quantity', v_line.quantity, 'is_veg', v_line.is_veg, 'options', v_line.options, 'note', v_line.note,
      'line_total', v_line_total);
    v_sub := v_sub + v_line_total;
  end loop;

  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    select * into v_c from public.coupons where restaurant_id = p_rest_id and code = upper(trim(p_coupon));
    if not found or not v_c.is_active then
      v_err := 'This coupon code is not valid.';
    elsif v_c.valid_from is not null and p_at < v_c.valid_from then
      v_err := 'This coupon is not active yet.';
    elsif v_c.valid_until is not null and p_at > v_c.valid_until then
      v_err := 'This coupon has expired.';
    elsif v_c.usage_limit is not null and v_c.used_count >= v_c.usage_limit then
      v_err := 'This coupon has been fully used.';
    elsif (v_sub - v_hh) < v_c.min_order then
      v_err := format('This coupon needs an order of ₹%s or more.', trim(to_char(v_c.min_order, 'FM999999990.##')));
    else
      v_base := v_sub - v_hh;
      if v_c.kind = 'percent' then
        v_coupon := round(v_base * v_c.value / 100, 2);
        if v_c.max_discount is not null then v_coupon := least(v_coupon, v_c.max_discount); end if;
      else
        v_coupon := least(v_c.value, v_base);
      end if;
    end if;
  end if;

  v_base := v_sub - v_hh - v_coupon;
  v_service := round(v_base * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_base + v_service) * v_rest.tax_rate / 100, 2);

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_sub,
    'happy_hour_discount', v_hh,
    'happy_hour_names', to_jsonb(v_hh_names),
    'coupon_discount', v_coupon,
    'coupon_id', case when v_coupon > 0 then v_c.id end,
    'coupon_code', case when v_coupon > 0 then v_c.code end,
    'coupon_error', v_err,
    'discount', v_hh + v_coupon,
    'service_charge', v_service,
    'tax', v_tax,
    'total', v_base + v_service + v_tax
  );
end $$;
revoke all on function public._price_order(uuid, jsonb, text, timestamptz) from public;

create or replace function public._discount_reason(p_priced jsonb)
returns text
language sql immutable as $$
  select nullif(concat_ws(' · ',
    case when (p_priced->>'happy_hour_discount')::numeric > 0
         then (select string_agg(x, ', ') from jsonb_array_elements_text(p_priced->'happy_hour_names') x) end,
    case when (p_priced->>'coupon_discount')::numeric > 0 then 'Coupon ' || (p_priced->>'coupon_code') end
  ), '')
$$;

-- ===========================================================================
-- 5. Inventory & purchasing
-- ===========================================================================
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'pcs', 'pack', 'dozen')),
  stock_qty numeric(12,3) not null default 0,
  low_stock_threshold numeric(12,3) not null default 0,
  avg_cost numeric(12,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity numeric(12,3) not null check (quantity > 0),
  unique (menu_item_id, ingredient_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  change numeric(12,3) not null,
  reason text not null check (reason in ('sale', 'sale_reversal', 'purchase', 'waste', 'adjustment', 'opening')),
  order_id uuid references public.orders (id) on delete set null,
  purchase_order_id uuid,
  unit_cost numeric(12,4),
  note text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_restaurant_idx on public.stock_movements (restaurant_id, created_at desc);
create index if not exists stock_movements_ingredient_idx on public.stock_movements (ingredient_id, created_at desc);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  gstin text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  po_number integer not null,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_on date,
  note text,
  total numeric(12,2) not null default 0,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  received_at timestamptz,
  unique (restaurant_id, po_number)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  received_qty numeric(12,3) not null default 0
);

-- Deduct (p_sign = -1) or restore (+1) stock for an order's recipes. Never blocks a sale.
create or replace function public._apply_stock(p_order_id uuid, p_sign integer, p_round integer default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_sign < 0 then
    with m as (
      insert into public.stock_movements (restaurant_id, ingredient_id, change, reason, order_id, unit_cost)
      select o.restaurant_id, r.ingredient_id, -sum(r.quantity * oi.quantity), 'sale', o.id, max(i.avg_cost)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      join public.recipe_items r on r.menu_item_id = oi.menu_item_id
      join public.ingredients i on i.id = r.ingredient_id
      where oi.order_id = p_order_id and (p_round is null or oi.round = p_round)
      group by o.restaurant_id, r.ingredient_id, o.id
      returning ingredient_id, change
    )
    update public.ingredients i set stock_qty = i.stock_qty + m.change from m where i.id = m.ingredient_id;
  else
    -- Undo whatever is still deducted for this order.
    with net as (
      select restaurant_id, ingredient_id, sum(change) as deducted, max(unit_cost) as unit_cost
      from public.stock_movements
      where order_id = p_order_id and reason in ('sale', 'sale_reversal')
      group by restaurant_id, ingredient_id
      having sum(change) < 0
    ), m as (
      insert into public.stock_movements (restaurant_id, ingredient_id, change, reason, order_id, unit_cost)
      select restaurant_id, ingredient_id, -deducted, 'sale_reversal', p_order_id, unit_cost from net
      returning ingredient_id, change
    )
    update public.ingredients i set stock_qty = i.stock_qty + m.change from m where i.id = m.ingredient_id;
  end if;
end $$;
revoke all on function public._apply_stock(uuid, integer, integer) from public;

-- Deduct when the kitchen takes the order; give back if it is cancelled afterwards.
create or replace function public.orders_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('accepted', 'preparing', 'ready', 'served') and not old.stock_deducted then
      perform public._apply_stock(new.id, -1, null);
      new.stock_deducted := true;
    elsif new.status = 'cancelled' and old.stock_deducted then
      perform public._apply_stock(new.id, 1, null);
      new.stock_deducted := false;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_stock on public.orders;
create trigger orders_stock before update of status on public.orders
  for each row execute function public.orders_stock();

-- ===========================================================================
-- 6. Bills, payments, refunds
-- ===========================================================================
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  bill_number integer not null,
  table_id uuid references public.dining_tables (id) on delete set null,
  order_ids uuid[] not null,
  subtotal numeric(10,2) not null,
  discount_amount numeric(10,2) not null default 0,
  service_charge numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  tip_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  status text not null default 'settled' check (status in ('settled', 'refunded')),
  note text,
  refund_reason text,
  settled_by uuid references public.staff (id) on delete set null,
  settled_at timestamptz not null default now(),
  refunded_at timestamptz,
  unique (restaurant_id, bill_number)
);
create index if not exists bills_restaurant_idx on public.bills (restaurant_id, settled_at desc);

create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'upi', 'gift_card', 'other')),
  amount numeric(10,2) not null,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists bill_payments_restaurant_idx on public.bill_payments (restaurant_id, created_at desc);

do $$ begin
  alter table public.orders add constraint orders_bill_fk foreign key (bill_id) references public.bills (id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.bill_json(p_bill_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(b)
    || jsonb_build_object(
         'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.bill_payments p where p.bill_id = b.id), '[]'::jsonb),
         'orders', coalesce((select jsonb_agg(public.order_json(o.id) order by o.placed_at) from public.orders o where o.id = any (b.order_ids)), '[]'::jsonb),
         'table', (select jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label, 'area', t.area) from public.dining_tables t where t.id = b.table_id)
       )
  from public.bills b where b.id = p_bill_id and b.restaurant_id = public.current_staff_restaurant()
$$;

-- Settle one or more unpaid orders as one bill (table bill merge), with an optional extra discount,
-- tip and any mix of payment methods (split tender). Payments must add up to total + tip.
create or replace function public.settle_bill(
  p_order_ids uuid[],
  p_discount_type text,
  p_discount_value numeric,
  p_discount_reason text,
  p_tip numeric,
  p_payments jsonb,
  p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_staff uuid;
  v_rest public.restaurants%rowtype;
  v_o public.orders%rowtype;
  v_count integer;
  v_base_total numeric(12,2) := 0;
  v_extra numeric(12,2) := 0;
  v_alloc numeric(12,2);
  v_left numeric(12,2);
  v_i integer := 0;
  v_n integer;
  v_base numeric(12,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
  v_bill_id uuid;
  v_number integer;
  v_sub numeric(12,2) := 0; v_disc numeric(12,2) := 0; v_svc numeric(12,2) := 0; v_tx numeric(12,2) := 0; v_tot numeric(12,2) := 0;
  v_tip numeric(10,2) := round(coalesce(p_tip, 0), 2);
  v_pay jsonb;
  v_paid numeric(12,2) := 0;
  v_gc public.gift_cards%rowtype;
  v_table uuid;
  v_tables integer;
begin
  if v_rid is null then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  select id into v_staff from public.staff where user_id = auth.uid();
  if p_order_ids is null or cardinality(p_order_ids) = 0 then raise exception 'Pick at least one order to bill.' using errcode = 'P0001'; end if;
  if v_tip < 0 then raise exception 'Tip cannot be negative.' using errcode = 'P0001'; end if;

  select * into v_rest from public.restaurants where id = v_rid for update;
  select count(*) into v_count from public.orders where id = any (p_order_ids) and restaurant_id = v_rid;
  if v_count <> cardinality(p_order_ids) then raise exception 'One of the orders is not from this restaurant.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.orders where id = any (p_order_ids) and (status = 'cancelled' or payment_status not in ('pending', 'claimed') or bill_id is not null)) then
    raise exception 'One of the orders is cancelled or already paid.' using errcode = 'P0001';
  end if;
  select count(distinct table_id), max(table_id::text)::uuid into v_tables, v_table from public.orders where id = any (p_order_ids);

  select sum(subtotal - discount_amount) into v_base_total from public.orders where id = any (p_order_ids);
  if coalesce(p_discount_type, 'none') = 'percent' then
    if p_discount_value <= 0 or p_discount_value > 100 then raise exception 'Discount must be between 0 and 100%%.' using errcode = 'P0001'; end if;
    v_extra := round(v_base_total * p_discount_value / 100, 2);
  elsif p_discount_type = 'flat' then
    if p_discount_value <= 0 then raise exception 'Discount must be more than ₹0.' using errcode = 'P0001'; end if;
    v_extra := least(round(p_discount_value, 2), v_base_total);
  end if;
  if v_extra > 0 and not public.is_staff_manager() then
    raise exception 'Only owners and managers can give a discount.' using errcode = '42501';
  end if;

  v_left := v_extra;
  v_n := cardinality(p_order_ids);
  for v_o in select * from public.orders where id = any (p_order_ids) order by placed_at for update loop
    v_i := v_i + 1;
    if v_base_total > 0 and v_i < v_n then
      v_alloc := round(v_extra * (v_o.subtotal - v_o.discount_amount) / v_base_total, 2);
    else
      v_alloc := v_left;
    end if;
    v_left := v_left - v_alloc;
    v_base := v_o.subtotal - v_o.discount_amount - v_alloc;
    v_service := round(v_base * v_rest.service_charge_rate / 100, 2);
    v_tax := round((v_base + v_service) * v_rest.tax_rate / 100, 2);
    update public.orders set
      discount_amount = v_o.discount_amount + v_alloc,
      discount_reason = case when v_alloc > 0 then concat_ws(' · ', v_o.discount_reason, coalesce(nullif(trim(p_discount_reason), ''), 'Bill discount')) else v_o.discount_reason end,
      service_charge = v_service, tax_amount = v_tax, total = v_base + v_service + v_tax
    where id = v_o.id;
    v_sub := v_sub + v_o.subtotal;
    v_disc := v_disc + v_o.discount_amount + v_alloc;
    v_svc := v_svc + v_service;
    v_tx := v_tx + v_tax;
    v_tot := v_tot + v_base + v_service + v_tax;
  end loop;

  for v_pay in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if (v_pay->>'amount')::numeric <= 0 then raise exception 'Each payment must be more than ₹0.' using errcode = 'P0001'; end if;
    v_paid := v_paid + round((v_pay->>'amount')::numeric, 2);
  end loop;
  if abs(v_paid - (v_tot + v_tip)) > 0.01 then
    raise exception 'Payments add up to ₹%, but the bill is ₹%.', v_paid, v_tot + v_tip using errcode = 'P0001';
  end if;

  v_number := v_rest.next_bill_number;
  update public.restaurants set next_bill_number = next_bill_number + 1 where id = v_rid;
  insert into public.bills (restaurant_id, bill_number, table_id, order_ids, subtotal, discount_amount, service_charge, tax_amount, tip_amount, total, note, settled_by)
  values (v_rid, v_number, case when v_tables = 1 then v_table end, p_order_ids, v_sub, v_disc, v_svc, v_tx, v_tip, v_tot, nullif(trim(coalesce(p_note, '')), ''), v_staff)
  returning id into v_bill_id;

  for v_pay in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if v_pay->>'method' not in ('cash', 'card', 'upi', 'gift_card', 'other') then
      raise exception 'Unknown payment method.' using errcode = 'P0001';
    end if;
    if v_pay->>'method' = 'gift_card' then
      select * into v_gc from public.gift_cards where restaurant_id = v_rid and code = upper(trim(v_pay->>'reference')) for update;
      if not found or not v_gc.is_active or (v_gc.expires_at is not null and v_gc.expires_at < now()) then
        raise exception 'Gift card % is not valid.', upper(trim(coalesce(v_pay->>'reference', ''))) using errcode = 'P0001';
      end if;
      if v_gc.balance < (v_pay->>'amount')::numeric then
        raise exception 'Gift card % has only ₹% left.', v_gc.code, v_gc.balance using errcode = 'P0001';
      end if;
      update public.gift_cards set balance = balance - (v_pay->>'amount')::numeric where id = v_gc.id;
      insert into public.gift_card_transactions (gift_card_id, amount, bill_id, note) values (v_gc.id, -(v_pay->>'amount')::numeric, v_bill_id, 'Bill payment');
    end if;
    insert into public.bill_payments (bill_id, restaurant_id, method, amount, reference)
    values (v_bill_id, v_rid, v_pay->>'method', round((v_pay->>'amount')::numeric, 2), nullif(trim(coalesce(v_pay->>'reference', '')), ''));
  end loop;

  update public.orders set payment_status = 'paid', bill_id = v_bill_id where id = any (p_order_ids);
  return public.bill_json(v_bill_id);
end $$;

create or replace function public.refund_bill(p_bill_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b public.bills%rowtype;
  v_t record;
begin
  if not public.is_staff_manager() then raise exception 'Only owners and managers can refund.' using errcode = '42501'; end if;
  select * into v_b from public.bills where id = p_bill_id and restaurant_id = public.current_staff_restaurant() for update;
  if not found then raise exception 'Bill not found.' using errcode = 'P0001'; end if;
  if v_b.status = 'refunded' then raise exception 'This bill is already refunded.' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Give a reason for the refund.' using errcode = 'P0001'; end if;
  update public.bills set status = 'refunded', refund_reason = trim(p_reason), refunded_at = now() where id = v_b.id;
  update public.orders set payment_status = 'refunded' where id = any (v_b.order_ids);
  -- Money back on gift cards.
  for v_t in select gift_card_id, -amount as amount from public.gift_card_transactions where bill_id = v_b.id and amount < 0 loop
    update public.gift_cards set balance = balance + v_t.amount where id = v_t.gift_card_id;
    insert into public.gift_card_transactions (gift_card_id, amount, bill_id, note) values (v_t.gift_card_id, v_t.amount, v_b.id, 'Refund');
  end loop;
  return public.bill_json(v_b.id);
end $$;

-- ===========================================================================
-- 7. Order placement v4 (QR dine-in + online takeaway, coupons, happy hours)
-- ===========================================================================
drop function if exists public.place_order(text, uuid, text, public.payment_method, text, jsonb, text, boolean, text, uuid);

create or replace function public.place_order(
  p_table_code text,
  p_guest_session_id uuid,
  p_guest_name text,
  p_payment_method public.payment_method,
  p_note text,
  p_items jsonb,
  p_phone text default null,
  p_marketing_consent boolean default false,
  p_consent_text text default null,
  p_client_ref uuid default null,
  p_order_type text default 'dine_in',
  p_restaurant_slug text default null,
  p_pickup_at timestamptz default null,
  p_coupon_code text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table public.dining_tables%rowtype;
  v_rest public.restaurants%rowtype;
  v_customer public.customers%rowtype;
  v_existing uuid;
  v_order_id uuid;
  v_number integer;
  v_phone text;
  v_name text := nullif(trim(coalesce(p_guest_name, '')), '');
  v_priced jsonb;
  v_line jsonb;
  v_pos integer := 0;
  v_at timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the order' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many items in one order' using errcode = 'P0001';
  end if;
  if coalesce(p_order_type, 'dine_in') not in ('dine_in', 'takeaway') then
    raise exception 'Unknown order type' using errcode = 'P0001';
  end if;

  if coalesce(p_order_type, 'dine_in') = 'dine_in' then
    select * into v_table from public.dining_tables where code = upper(p_table_code) and is_active;
    if not found then
      raise exception 'This table QR is not active. Please ask the staff.' using errcode = 'P0001';
    end if;
    select * into v_rest from public.restaurants where id = v_table.restaurant_id for update;
  else
    select * into v_rest from public.restaurants where slug = lower(trim(coalesce(p_restaurant_slug, ''))) for update;
    if not found or not v_rest.takeaway_enabled or v_rest.plan = 'starter' then
      raise exception 'This restaurant is not taking takeaway orders online.' using errcode = 'P0001';
    end if;
    if v_name is null then raise exception 'Please add your name for the pickup.' using errcode = 'P0001'; end if;
    if public.normalize_in_phone(p_phone) is null then
      raise exception 'Please add a valid 10-digit mobile number so we can reach you about the pickup.' using errcode = 'P0001';
    end if;
  end if;

  if p_client_ref is not null then
    select id into v_existing from public.orders where restaurant_id = v_rest.id and client_ref = p_client_ref;
    if v_existing is not null then return public.order_json(v_existing); end if;
  end if;

  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'upi' and not v_rest.accepts_upi then
    raise exception 'UPI payment is not available here.' using errcode = 'P0001';
  end if;
  if p_payment_method = 'counter' and not v_rest.accepts_counter then
    raise exception 'Pay at counter is not available here.' using errcode = 'P0001';
  end if;

  v_at := now();
  if p_order_type = 'takeaway' then
    if p_pickup_at is not null then
      if p_pickup_at < now() + make_interval(mins => greatest(v_rest.takeaway_prep_minutes - 5, 0)) then
        raise exception 'Pick a pickup time at least % minutes from now.', v_rest.takeaway_prep_minutes using errcode = 'P0001';
      end if;
      if p_pickup_at > now() + interval '7 days' then
        raise exception 'Pickups can be scheduled up to 7 days ahead.' using errcode = 'P0001';
      end if;
      if not public.window_open(v_rest.open_time, v_rest.close_time, null, p_pickup_at) then
        raise exception 'Pick a time between % and %.', to_char(v_rest.open_time, 'HH24:MI'), to_char(v_rest.close_time, 'HH24:MI') using errcode = 'P0001';
      end if;
      v_at := p_pickup_at;
    elsif not public.window_open(v_rest.open_time, v_rest.close_time, null, now() + make_interval(mins => v_rest.takeaway_prep_minutes)) then
      raise exception 'We are closed right now. Schedule a pickup between % and %.', to_char(v_rest.open_time, 'HH24:MI'), to_char(v_rest.close_time, 'HH24:MI') using errcode = 'P0001';
    end if;
  end if;

  if nullif(trim(coalesce(p_phone, '')), '') is not null and (v_rest.plan <> 'starter' or p_order_type = 'takeaway') then
    v_phone := public.normalize_in_phone(p_phone);
    if v_phone is null then
      raise exception 'Please enter a valid 10-digit Indian mobile number, or leave it empty.' using errcode = 'P0001';
    end if;
    insert into public.customers (restaurant_id, phone, name)
    values (v_rest.id, v_phone, v_name)
    on conflict (restaurant_id, phone) do update
      set last_seen_at = now(), name = coalesce(excluded.name, public.customers.name)
    returning * into v_customer;

    if coalesce(p_marketing_consent, false) and v_rest.marketing_consent_enabled and v_rest.plan <> 'starter' and not v_customer.marketing_consent then
      update public.customers set marketing_consent = true, consent_at = now(), consent_revoked_at = null where id = v_customer.id;
      insert into public.consent_events (restaurant_id, customer_id, action, source, consent_text)
      values (v_rest.id, v_customer.id, 'granted', 'qr_checkout', left(p_consent_text, 500));
    end if;
  end if;

  v_priced := public._price_order(v_rest.id, p_items, p_coupon_code, v_at);
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null and v_priced->>'coupon_error' is not null then
    raise exception '%', v_priced->>'coupon_error' using errcode = 'P0001';
  end if;

  v_number := v_rest.next_order_number;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rest.id;

  insert into public.orders (
    restaurant_id, table_id, order_number, guest_session_id, guest_name, payment_method, note, customer_id, client_ref,
    order_type, source, pickup_at, subtotal, discount_amount, discount_reason, coupon_code, service_charge, tax_amount, total)
  values (
    v_rest.id, case when p_order_type = 'takeaway' then null else v_table.id end, v_number, p_guest_session_id, v_name, p_payment_method,
    nullif(trim(coalesce(p_note, '')), ''), v_customer.id, p_client_ref,
    coalesce(p_order_type, 'dine_in'), case when p_order_type = 'takeaway' then 'online' else 'qr' end,
    case when p_order_type = 'takeaway' then coalesce(p_pickup_at, now() + make_interval(mins => v_rest.takeaway_prep_minutes)) end,
    (v_priced->>'subtotal')::numeric, (v_priced->>'discount')::numeric, public._discount_reason(v_priced), v_priced->>'coupon_code',
    (v_priced->>'service_charge')::numeric, (v_priced->>'tax')::numeric, (v_priced->>'total')::numeric)
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(v_priced->'lines') loop
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (v_order_id, (v_line->>'menu_item_id')::uuid, v_line->>'name', (v_line->>'unit_price')::numeric, (v_line->>'quantity')::int,
            (v_line->>'is_veg')::boolean, v_line->'options', v_line->>'note', (v_line->>'line_total')::numeric, v_pos, 1);
    v_pos := v_pos + 1;
  end loop;

  if (v_priced->>'coupon_discount')::numeric > 0 then
    update public.coupons set used_count = used_count + 1 where id = (v_priced->>'coupon_id')::uuid;
  end if;

  return public.order_json(v_order_id);
end $$;

revoke all on function public.place_order(text, uuid, text, public.payment_method, text, jsonb, text, boolean, text, uuid, text, text, timestamptz, text) from public;
grant execute on function public.place_order(text, uuid, text, public.payment_method, text, jsonb, text, boolean, text, uuid, text, text, timestamptz, text) to anon, authenticated, service_role;

-- Price preview for the cart (coupon check, happy hour) — never writes anything.
create or replace function public.quote_order(p_table_code text, p_restaurant_slug text, p_items jsonb, p_coupon_code text, p_pickup_at timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rid uuid;
  v_q jsonb;
begin
  if p_table_code is not null then
    select restaurant_id into v_rid from public.dining_tables where code = upper(p_table_code) and is_active;
  else
    select id into v_rid from public.restaurants where slug = lower(trim(coalesce(p_restaurant_slug, '')));
  end if;
  if v_rid is null then raise exception 'Restaurant not found.' using errcode = 'P0001'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('subtotal', 0, 'discount', 0, 'happy_hour_discount', 0, 'coupon_discount', 0, 'service_charge', 0, 'tax', 0, 'total', 0, 'coupon_error', null, 'happy_hour_names', '[]'::jsonb);
  end if;
  v_q := public._price_order(v_rid, p_items, p_coupon_code, coalesce(p_pickup_at, now()));
  return v_q - 'lines' - 'coupon_id';
end $$;
revoke all on function public.quote_order(text, text, jsonb, text, timestamptz) from public;
grant execute on function public.quote_order(text, text, jsonb, text, timestamptz) to anon, authenticated, service_role;

-- Guest takeaway orders for this phone session.
create or replace function public.get_takeaway_session_orders(p_restaurant_slug text, p_guest_session_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.order_json(o.id) order by o.placed_at desc), '[]'::jsonb)
  from public.orders o join public.restaurants r on r.id = o.restaurant_id
  where r.slug = lower(trim(p_restaurant_slug)) and o.guest_session_id = p_guest_session_id
    and o.order_type = 'takeaway' and o.placed_at > now() - interval '3 days'
$$;
revoke all on function public.get_takeaway_session_orders(text, uuid) from public;
grant execute on function public.get_takeaway_session_orders(text, uuid) to anon, authenticated, service_role;

-- add_order_items: keep existing discount, apply happy hour to the new lines, deduct stock if already deducted.
create or replace function public.add_order_items(p_order_id uuid, p_guest_session_id uuid, p_items jsonb, p_client_ref uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_rest public.restaurants%rowtype;
  v_priced jsonb;
  v_line jsonb;
  v_round integer;
  v_pos integer;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2);
  v_base numeric(10,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one dish' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'Too many dishes at once' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id and guest_session_id = p_guest_session_id for update;
  if not found then
    raise exception 'We could not find this order on this phone.' using errcode = 'P0001';
  end if;
  if p_client_ref is not null and v_order.last_add_ref = p_client_ref then
    return public.order_json(p_order_id);
  end if;
  if v_order.status not in ('placed', 'accepted', 'preparing') then
    raise exception 'This order is already %. Place a new order for anything else.', v_order.status using errcode = 'P0001';
  end if;
  if v_order.payment_status <> 'pending' or v_order.bill_id is not null then
    raise exception 'This order is already being paid. Place a new order for anything else.' using errcode = 'P0001';
  end if;

  select * into v_rest from public.restaurants where id = v_order.restaurant_id;
  if not v_rest.is_open then
    raise exception 'The restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;

  v_priced := public._price_order(v_rest.id, p_items, null, now());
  select coalesce(max(round), 1) + 1, coalesce(max(position), -1) + 1 into v_round, v_pos
    from public.order_items where order_id = p_order_id;

  for v_line in select * from jsonb_array_elements(v_priced->'lines') loop
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (p_order_id, (v_line->>'menu_item_id')::uuid, v_line->>'name', (v_line->>'unit_price')::numeric, (v_line->>'quantity')::int,
            (v_line->>'is_veg')::boolean, v_line->'options', v_line->>'note', (v_line->>'line_total')::numeric, v_pos, v_round);
    v_pos := v_pos + 1;
  end loop;

  select coalesce(sum(line_total), 0) into v_subtotal from public.order_items where order_id = p_order_id;
  v_discount := v_order.discount_amount + (v_priced->>'happy_hour_discount')::numeric;
  v_base := v_subtotal - v_discount;
  v_service := round(v_base * v_rest.service_charge_rate / 100, 2);
  v_tax := round((v_base + v_service) * v_rest.tax_rate / 100, 2);
  update public.orders
    set subtotal = v_subtotal, discount_amount = v_discount,
        discount_reason = case when (v_priced->>'happy_hour_discount')::numeric > 0 and v_order.discount_reason is null then public._discount_reason(v_priced) else v_order.discount_reason end,
        service_charge = v_service, tax_amount = v_tax,
        total = v_base + v_service + v_tax, items_added_at = now(),
        last_add_ref = coalesce(p_client_ref, last_add_ref)
    where id = p_order_id;

  if v_order.stock_deducted then
    perform public._apply_stock(p_order_id, -1, v_round);
  end if;

  return public.order_json(p_order_id);
end $$;
revoke all on function public.add_order_items(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.add_order_items(uuid, uuid, jsonb, uuid) to anon, authenticated, service_role;

-- Staff take an order at the counter (dine-in or takeaway). Goes straight to the kitchen as accepted.
create or replace function public.staff_place_order(
  p_table_id uuid,
  p_order_type text,
  p_items jsonb,
  p_guest_name text,
  p_phone text,
  p_note text,
  p_client_ref uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_staff uuid;
  v_rest public.restaurants%rowtype;
  v_table public.dining_tables%rowtype;
  v_customer public.customers%rowtype;
  v_existing uuid;
  v_priced jsonb;
  v_line jsonb;
  v_pos integer := 0;
  v_order_id uuid;
  v_number integer;
  v_phone text;
  v_name text := nullif(trim(coalesce(p_guest_name, '')), '');
begin
  if v_rid is null then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  if public.current_staff_role() = 'kitchen' then raise exception 'Kitchen accounts cannot take orders.' using errcode = '42501'; end if;
  select id into v_staff from public.staff where user_id = auth.uid();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one dish.' using errcode = 'P0001';
  end if;
  if coalesce(p_order_type, '') not in ('dine_in', 'takeaway') then raise exception 'Pick dine-in or takeaway.' using errcode = 'P0001'; end if;

  select * into v_rest from public.restaurants where id = v_rid for update;
  if p_client_ref is not null then
    select id into v_existing from public.orders where restaurant_id = v_rid and client_ref = p_client_ref;
    if v_existing is not null then return public.order_json(v_existing); end if;
  end if;
  if p_order_type = 'dine_in' then
    select * into v_table from public.dining_tables where id = p_table_id and restaurant_id = v_rid;
    if not found then raise exception 'Pick a table for a dine-in order.' using errcode = 'P0001'; end if;
  end if;

  if nullif(trim(coalesce(p_phone, '')), '') is not null then
    v_phone := public.normalize_in_phone(p_phone);
    if v_phone is null then raise exception 'Enter a valid 10-digit mobile number, or leave it empty.' using errcode = 'P0001'; end if;
    insert into public.customers (restaurant_id, phone, name) values (v_rid, v_phone, v_name)
    on conflict (restaurant_id, phone) do update set last_seen_at = now(), name = coalesce(excluded.name, public.customers.name)
    returning * into v_customer;
  end if;

  v_priced := public._price_order(v_rid, p_items, null, now());
  v_number := v_rest.next_order_number;
  update public.restaurants set next_order_number = next_order_number + 1 where id = v_rid;

  insert into public.orders (
    restaurant_id, table_id, order_number, guest_session_id, guest_name, payment_method, note, customer_id, client_ref,
    order_type, source, placed_by, status, accepted_at, subtotal, discount_amount, discount_reason, service_charge, tax_amount, total)
  values (
    v_rid, case when p_order_type = 'dine_in' then v_table.id end, v_number, gen_random_uuid(), v_name, 'counter',
    nullif(trim(coalesce(p_note, '')), ''), v_customer.id, p_client_ref,
    p_order_type, 'pos', v_staff, 'accepted', now(),
    (v_priced->>'subtotal')::numeric, (v_priced->>'discount')::numeric, public._discount_reason(v_priced),
    (v_priced->>'service_charge')::numeric, (v_priced->>'tax')::numeric, (v_priced->>'total')::numeric)
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(v_priced->'lines') loop
    insert into public.order_items (order_id, menu_item_id, name, unit_price, quantity, is_veg, options, note, line_total, position, round)
    values (v_order_id, (v_line->>'menu_item_id')::uuid, v_line->>'name', (v_line->>'unit_price')::numeric, (v_line->>'quantity')::int,
            (v_line->>'is_veg')::boolean, v_line->'options', v_line->>'note', (v_line->>'line_total')::numeric, v_pos, 1);
    v_pos := v_pos + 1;
  end loop;

  perform public._apply_stock(v_order_id, -1, null);
  update public.orders set stock_deducted = true where id = v_order_id;

  return public.order_json(v_order_id);
end $$;

-- Move every open order of one table to another (table transfer; into an occupied table = merge).
create or replace function public.transfer_table_orders(p_from_table uuid, p_to_table uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_n integer;
begin
  if v_rid is null then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  if p_from_table = p_to_table then raise exception 'Pick a different table.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.dining_tables where id = p_to_table and restaurant_id = v_rid and is_active) then
    raise exception 'The target table is not available.' using errcode = 'P0001';
  end if;
  update public.orders set table_id = p_to_table
    where restaurant_id = v_rid and table_id = p_from_table and status <> 'cancelled'
      and payment_status in ('pending', 'claimed') and bill_id is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'This table has no open orders to move.' using errcode = 'P0001'; end if;
  update public.assistance_calls set table_id = p_to_table where table_id = p_from_table and status = 'open' and restaurant_id = v_rid;
  return v_n;
end $$;

-- ===========================================================================
-- 8. Reservations & waitlist
-- ===========================================================================
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_name text not null,
  phone text not null,
  party_size integer not null check (party_size between 1 and 50),
  reserved_for timestamptz not null,
  duration_minutes integer not null default 90 check (duration_minutes between 15 and 480),
  table_id uuid references public.dining_tables (id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  source text not null default 'staff' check (source in ('staff', 'online', 'phone')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reservations_restaurant_idx on public.reservations (restaurant_id, reserved_for);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_name text not null,
  phone text,
  party_size integer not null check (party_size between 1 and 50),
  quoted_minutes integer,
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'seated', 'left')),
  table_id uuid references public.dining_tables (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  seated_at timestamptz
);
create index if not exists waitlist_restaurant_idx on public.waitlist (restaurant_id, created_at desc);

-- Public booking request (restaurant page). Staff confirm it.
create or replace function public.request_reservation(
  p_restaurant_slug text, p_name text, p_phone text, p_party_size integer, p_reserved_for timestamptz, p_note text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rest public.restaurants%rowtype;
  v_phone text := public.normalize_in_phone(p_phone);
  v_id uuid;
begin
  select * into v_rest from public.restaurants where slug = lower(trim(coalesce(p_restaurant_slug, '')));
  if not found or not v_rest.reservations_enabled or v_rest.plan = 'starter' then
    raise exception 'This restaurant is not taking table bookings online.' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Please add your name.' using errcode = 'P0001'; end if;
  if v_phone is null then raise exception 'Please add a valid 10-digit mobile number.' using errcode = 'P0001'; end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 30 then raise exception 'Party size must be 1 to 30. For bigger groups, call the restaurant.' using errcode = 'P0001'; end if;
  if p_reserved_for < now() + interval '30 minutes' then raise exception 'Book at least 30 minutes ahead.' using errcode = 'P0001'; end if;
  if p_reserved_for > now() + interval '60 days' then raise exception 'Bookings open up to 60 days ahead.' using errcode = 'P0001'; end if;
  if not public.window_open(v_rest.open_time, v_rest.close_time, null, p_reserved_for) then
    raise exception 'Pick a time between % and %.', to_char(v_rest.open_time, 'HH24:MI'), to_char(v_rest.close_time, 'HH24:MI') using errcode = 'P0001';
  end if;
  if (select count(*) from public.reservations where restaurant_id = v_rest.id and phone = v_phone and status in ('requested', 'confirmed') and reserved_for > now()) >= 3 then
    raise exception 'You already have upcoming bookings here. Call the restaurant to change them.' using errcode = 'P0001';
  end if;
  insert into public.reservations (restaurant_id, customer_name, phone, party_size, reserved_for, duration_minutes, source, note)
  values (v_rest.id, trim(p_name), v_phone, p_party_size, p_reserved_for, v_rest.reservation_minutes, 'online', nullif(trim(left(coalesce(p_note, ''), 300)), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'requested', 'restaurant', v_rest.name, 'reserved_for', p_reserved_for, 'party_size', p_party_size);
end $$;
revoke all on function public.request_reservation(text, text, text, integer, timestamptz, text) from public;
grant execute on function public.request_reservation(text, text, text, integer, timestamptz, text) to anon, authenticated, service_role;

-- ===========================================================================
-- 9. Expenses, budgets, cash close, P&L
-- ===========================================================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  spent_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  category text not null check (category in ('ingredients', 'salaries', 'rent', 'utilities', 'gas', 'maintenance', 'marketing', 'packaging', 'licences', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  paid_via text not null default 'cash' check (paid_via in ('cash', 'upi', 'card', 'bank')),
  vendor text,
  note text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_restaurant_idx on public.expenses (restaurant_id, spent_on desc);

create table if not exists public.expense_budgets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  unique (restaurant_id, month, category)
);

create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  business_date date not null,
  opening_float numeric(12,2) not null default 0,
  cash_sales numeric(12,2) not null,
  cash_refunds numeric(12,2) not null default 0,
  cash_expenses numeric(12,2) not null,
  expected_cash numeric(12,2) not null,
  counted_cash numeric(12,2) not null,
  variance numeric(12,2) not null,
  note text,
  closed_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, business_date)
);

-- Cash figures for one IST business day (used for the close and its preview).
create or replace function public.cash_day_summary(p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select public.current_staff_restaurant() as rid),
  bounds as (select (p_date::timestamp at time zone 'Asia/Kolkata') as f, ((p_date + 1)::timestamp at time zone 'Asia/Kolkata') as t)
  select jsonb_build_object(
    'business_date', p_date,
    'cash_sales', coalesce((select sum(p.amount) from public.bill_payments p join public.bills b on b.id = p.bill_id, r, bounds
                            where p.restaurant_id = r.rid and p.method = 'cash' and b.settled_at >= bounds.f and b.settled_at < bounds.t), 0),
    'cash_refunds', coalesce((select sum(p.amount) from public.bill_payments p join public.bills b on b.id = p.bill_id, r, bounds
                              where p.restaurant_id = r.rid and p.method = 'cash' and b.status = 'refunded' and b.refunded_at >= bounds.f and b.refunded_at < bounds.t), 0),
    'cash_expenses', coalesce((select sum(e.amount) from public.expenses e, r where e.restaurant_id = r.rid and e.paid_via = 'cash' and e.spent_on = p_date), 0),
    'by_method', coalesce((select jsonb_object_agg(method, amt) from (
                    select p.method, sum(p.amount) as amt from public.bill_payments p join public.bills b on b.id = p.bill_id, r, bounds
                    where p.restaurant_id = r.rid and b.settled_at >= bounds.f and b.settled_at < bounds.t group by p.method) x), '{}'::jsonb),
    'bills', (select count(*) from public.bills b, r, bounds where b.restaurant_id = r.rid and b.settled_at >= bounds.f and b.settled_at < bounds.t),
    'already_closed', exists (select 1 from public.cash_closings c, r where c.restaurant_id = r.rid and c.business_date = p_date)
  )
$$;

create or replace function public.close_cash_day(p_date date, p_opening_float numeric, p_counted_cash numeric, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_s jsonb;
  v_expected numeric(12,2);
  v_row public.cash_closings%rowtype;
begin
  if not public.is_staff_manager() then raise exception 'Only owners and managers can close the day.' using errcode = '42501'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Enter the cash you counted.' using errcode = 'P0001'; end if;
  v_s := public.cash_day_summary(p_date);
  if (v_s->>'already_closed')::boolean then raise exception 'This day is already closed.' using errcode = 'P0001'; end if;
  v_expected := coalesce(p_opening_float, 0) + (v_s->>'cash_sales')::numeric - (v_s->>'cash_refunds')::numeric - (v_s->>'cash_expenses')::numeric;
  insert into public.cash_closings (restaurant_id, business_date, opening_float, cash_sales, cash_refunds, cash_expenses, expected_cash, counted_cash, variance, note, closed_by)
  values (v_rid, p_date, coalesce(p_opening_float, 0), (v_s->>'cash_sales')::numeric, (v_s->>'cash_refunds')::numeric, (v_s->>'cash_expenses')::numeric,
          v_expected, p_counted_cash, p_counted_cash - v_expected, nullif(trim(coalesce(p_note, '')), ''),
          (select id from public.staff where user_id = auth.uid()))
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.pnl_report(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with ok as (
    select * from public.orders
    where restaurant_id = p_restaurant_id and placed_at >= p_from and placed_at < p_to
      and status <> 'cancelled' and payment_status <> 'refunded'
  ),
  d as (select (p_from at time zone 'Asia/Kolkata')::date as df, ((p_to - interval '1 microsecond') at time zone 'Asia/Kolkata')::date as dt)
  select jsonb_build_object(
    'gross_sales', coalesce((select sum(subtotal) from ok), 0),
    'discounts', coalesce((select sum(discount_amount) from ok), 0),
    'service_charge', coalesce((select sum(service_charge) from ok), 0),
    'tax_collected', coalesce((select sum(tax_amount) from ok), 0),
    'net_sales', coalesce((select sum(subtotal - discount_amount + service_charge) from ok), 0),
    'tips', coalesce((select sum(tip_amount) from public.bills where restaurant_id = p_restaurant_id and status = 'settled' and settled_at >= p_from and settled_at < p_to), 0),
    'refunds', coalesce((select sum(total) from public.bills where restaurant_id = p_restaurant_id and status = 'refunded' and refunded_at >= p_from and refunded_at < p_to), 0),
    'food_cost', coalesce((select -sum(change * coalesce(unit_cost, 0)) from public.stock_movements
                           where restaurant_id = p_restaurant_id and reason in ('sale', 'sale_reversal') and created_at >= p_from and created_at < p_to), 0),
    'waste_cost', coalesce((select -sum(change * coalesce(unit_cost, 0)) from public.stock_movements
                            where restaurant_id = p_restaurant_id and reason = 'waste' and created_at >= p_from and created_at < p_to), 0),
    'expenses', coalesce((select jsonb_object_agg(category, amt) from (
                   select category, sum(amount) as amt from public.expenses, d
                   where restaurant_id = p_restaurant_id and spent_on >= d.df and spent_on <= d.dt group by category) x), '{}'::jsonb),
    'expenses_total', coalesce((select sum(amount) from public.expenses, d where restaurant_id = p_restaurant_id and spent_on >= d.df and spent_on <= d.dt), 0),
    'orders', (select count(*) from ok)
  )
$$;

-- ===========================================================================
-- 10. Staff invites, attendance, audit log
-- ===========================================================================
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  code text not null unique,
  role public.staff_role not null,
  display_name text,
  created_by uuid references public.staff (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text
);
create index if not exists staff_shifts_restaurant_idx on public.staff_shifts (restaurant_id, clock_in desc);
create unique index if not exists staff_shifts_one_open on public.staff_shifts (staff_id) where clock_out is null;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete set null,
  actor_name text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_restaurant_idx on public.audit_log (restaurant_id, created_at desc);

create or replace function public.create_staff_invite(p_role public.staff_role, p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_code text;
  v_row public.staff_invites%rowtype;
begin
  if not public.is_staff_manager() then raise exception 'Only owners and managers can invite staff.' using errcode = '42501'; end if;
  if p_role = 'owner' and public.current_staff_role() <> 'owner' then raise exception 'Only an owner can invite another owner.' using errcode = '42501'; end if;
  loop
    v_code := substr(translate(upper(encode(extensions.gen_random_bytes(12), 'base64')), '+/=0O1IL', ''), 1, 8);
    exit when length(v_code) = 8 and not exists (select 1 from public.staff_invites where code = v_code);
  end loop;
  insert into public.staff_invites (restaurant_id, code, role, display_name, created_by)
  values (v_rid, v_code, p_role, nullif(trim(coalesce(p_display_name, '')), ''), (select id from public.staff where user_id = auth.uid()))
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- A signed-in user who is not yet staff anywhere joins with an invite code.
create or replace function public.accept_staff_invite(p_code text, p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.staff_invites%rowtype;
  v_staff public.staff%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if exists (select 1 from public.staff where user_id = auth.uid()) then
    raise exception 'This account already belongs to a restaurant.' using errcode = 'P0001';
  end if;
  select * into v_inv from public.staff_invites where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found or v_inv.used_at is not null or v_inv.expires_at < now() then
    raise exception 'This invite code is not valid or has expired. Ask your manager for a new one.' using errcode = 'P0001';
  end if;
  insert into public.staff (user_id, restaurant_id, role, display_name)
  values (auth.uid(), v_inv.restaurant_id, v_inv.role, coalesce(nullif(trim(coalesce(p_display_name, '')), ''), v_inv.display_name, 'Staff'))
  returning * into v_staff;
  update public.staff_invites set used_at = now(), used_by = auth.uid() where id = v_inv.id;
  return to_jsonb(v_staff);
end $$;

create or replace function public.update_staff_member(p_staff_id uuid, p_role public.staff_role, p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_row public.staff%rowtype;
begin
  if public.current_staff_role() <> 'owner' then raise exception 'Only the owner can change staff roles.' using errcode = '42501'; end if;
  select * into v_row from public.staff where id = p_staff_id and restaurant_id = v_rid for update;
  if not found then raise exception 'Staff member not found.' using errcode = 'P0001'; end if;
  if v_row.role = 'owner' and p_role <> 'owner' and (select count(*) from public.staff where restaurant_id = v_rid and role = 'owner') = 1 then
    raise exception 'Keep at least one owner.' using errcode = 'P0001';
  end if;
  update public.staff set role = coalesce(p_role, role), display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name)
    where id = p_staff_id returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.remove_staff_member(p_staff_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_row public.staff%rowtype;
begin
  if public.current_staff_role() <> 'owner' then raise exception 'Only the owner can remove staff.' using errcode = '42501'; end if;
  select * into v_row from public.staff where id = p_staff_id and restaurant_id = v_rid;
  if not found then raise exception 'Staff member not found.' using errcode = 'P0001'; end if;
  if v_row.user_id = auth.uid() then raise exception 'You cannot remove yourself.' using errcode = 'P0001'; end if;
  update public.staff_shifts set clock_out = now() where staff_id = p_staff_id and clock_out is null;
  delete from public.staff where id = p_staff_id;
end $$;

create or replace function public.clock_in(p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff%rowtype;
  v_row public.staff_shifts%rowtype;
begin
  select * into v_staff from public.staff where user_id = auth.uid();
  if not found then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  if exists (select 1 from public.staff_shifts where staff_id = v_staff.id and clock_out is null) then
    raise exception 'You are already clocked in.' using errcode = 'P0001';
  end if;
  insert into public.staff_shifts (restaurant_id, staff_id, note) values (v_staff.restaurant_id, v_staff.id, nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.clock_out(p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.staff_shifts%rowtype;
begin
  update public.staff_shifts set clock_out = now(), note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
    where staff_id = (select id from public.staff where user_id = auth.uid()) and clock_out is null
    returning * into v_row;
  if not found then raise exception 'You are not clocked in.' using errcode = 'P0001'; end if;
  return to_jsonb(v_row);
end $$;

-- ===========================================================================
-- 11. Grants for staff RPCs
-- ===========================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.settle_bill(uuid[], text, numeric, text, numeric, jsonb, text)',
    'public.refund_bill(uuid, text)',
    'public.staff_place_order(uuid, text, jsonb, text, text, text, uuid)',
    'public.transfer_table_orders(uuid, uuid)',
    'public.cash_day_summary(date)',
    'public.close_cash_day(date, numeric, numeric, text)',
    'public.pnl_report(uuid, timestamptz, timestamptz)',
    'public.create_staff_invite(public.staff_role, text)',
    'public.accept_staff_invite(text, text)',
    'public.update_staff_member(uuid, public.staff_role, text)',
    'public.remove_staff_member(uuid)',
    'public.clock_in(text)',
    'public.clock_out(text)',
    'public.bill_json(uuid)',
    'public.is_staff_manager()'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ===========================================================================
-- 12. Row-level security
-- ===========================================================================
alter table public.coupons enable row level security;
alter table public.happy_hours enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.reservations enable row level security;
alter table public.waitlist enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_budgets enable row level security;
alter table public.cash_closings enable row level security;
alter table public.staff_invites enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.audit_log enable row level security;

-- Happy hours are public (the guest menu shows the current offer); everything else is staff-only.
do $$
declare
  t text;
begin
  -- Staff read; managers write
  foreach t in array array['coupons', 'happy_hours', 'gift_cards', 'ingredients', 'suppliers', 'purchase_orders', 'expenses', 'expense_budgets'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select using (restaurant_id = public.current_staff_restaurant())', t);
    execute format('drop policy if exists "%1$s managers insert" on public.%1$I', t);
    execute format('create policy "%1$s managers insert" on public.%1$I for insert with check (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager())', t);
    execute format('drop policy if exists "%1$s managers update" on public.%1$I', t);
    execute format('create policy "%1$s managers update" on public.%1$I for update using (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager())', t);
    execute format('drop policy if exists "%1$s managers delete" on public.%1$I', t);
    execute format('create policy "%1$s managers delete" on public.%1$I for delete using (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager())', t);
  end loop;
  -- Staff read and write (front-of-house)
  foreach t in array array['reservations', 'waitlist'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select using (restaurant_id = public.current_staff_restaurant())', t);
    execute format('drop policy if exists "%1$s staff insert" on public.%1$I', t);
    execute format('create policy "%1$s staff insert" on public.%1$I for insert with check (restaurant_id = public.current_staff_restaurant())', t);
    execute format('drop policy if exists "%1$s staff update" on public.%1$I', t);
    execute format('create policy "%1$s staff update" on public.%1$I for update using (restaurant_id = public.current_staff_restaurant())', t);
    execute format('drop policy if exists "%1$s staff delete" on public.%1$I', t);
    execute format('create policy "%1$s staff delete" on public.%1$I for delete using (restaurant_id = public.current_staff_restaurant())', t);
  end loop;
  -- Staff read only (written by functions)
  foreach t in array array['stock_movements', 'bills', 'bill_payments', 'cash_closings', 'staff_shifts'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select using (restaurant_id = public.current_staff_restaurant())', t);
  end loop;
end $$;

drop policy if exists "happy hours public read" on public.happy_hours;
create policy "happy hours public read" on public.happy_hours for select using (is_active);

drop policy if exists "gift card txns staff read" on public.gift_card_transactions;
create policy "gift card txns staff read" on public.gift_card_transactions for select
  using (exists (select 1 from public.gift_cards g where g.id = gift_card_id and g.restaurant_id = public.current_staff_restaurant()));

drop policy if exists "recipes staff read" on public.recipe_items;
create policy "recipes staff read" on public.recipe_items for select
  using (exists (select 1 from public.menu_items m where m.id = menu_item_id and m.restaurant_id = public.current_staff_restaurant()));
drop policy if exists "recipes managers write" on public.recipe_items;
create policy "recipes managers write" on public.recipe_items for all
  using (public.is_staff_manager() and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.restaurant_id = public.current_staff_restaurant()))
  with check (public.is_staff_manager() and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.restaurant_id = public.current_staff_restaurant()));

drop policy if exists "po items staff read" on public.purchase_order_items;
create policy "po items staff read" on public.purchase_order_items for select
  using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.restaurant_id = public.current_staff_restaurant()));
drop policy if exists "po items managers write" on public.purchase_order_items;
create policy "po items managers write" on public.purchase_order_items for all
  using (public.is_staff_manager() and exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.restaurant_id = public.current_staff_restaurant()))
  with check (public.is_staff_manager() and exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and p.restaurant_id = public.current_staff_restaurant()));

drop policy if exists "invites managers read" on public.staff_invites;
create policy "invites managers read" on public.staff_invites for select using (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager());
drop policy if exists "invites managers delete" on public.staff_invites;
create policy "invites managers delete" on public.staff_invites for delete using (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager());

drop policy if exists "audit managers read" on public.audit_log;
create policy "audit managers read" on public.audit_log for select using (restaurant_id = public.current_staff_restaurant() and public.is_staff_manager());
drop policy if exists "audit staff insert" on public.audit_log;
create policy "audit staff insert" on public.audit_log for insert with check (restaurant_id = public.current_staff_restaurant());

-- Staff may manage stock movements only through functions; managers record manual movements via the API's RPCs below.
create or replace function public.record_stock_movement(p_ingredient_id uuid, p_change numeric, p_reason text, p_note text, p_unit_cost numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ing public.ingredients%rowtype;
  v_row public.stock_movements%rowtype;
begin
  if not public.is_staff_manager() then raise exception 'Only owners and managers can adjust stock.' using errcode = '42501'; end if;
  if p_reason not in ('waste', 'adjustment', 'opening') then raise exception 'Use waste, adjustment or opening.' using errcode = 'P0001'; end if;
  if p_change = 0 then raise exception 'Enter a quantity.' using errcode = 'P0001'; end if;
  if p_reason = 'waste' and p_change > 0 then raise exception 'Waste reduces stock: enter how much was wasted.' using errcode = 'P0001'; end if;
  select * into v_ing from public.ingredients where id = p_ingredient_id and restaurant_id = public.current_staff_restaurant() for update;
  if not found then raise exception 'Ingredient not found.' using errcode = 'P0001'; end if;
  if p_reason = 'opening' and p_unit_cost is not null and p_change > 0 then
    update public.ingredients
      set avg_cost = case when greatest(stock_qty, 0) + p_change > 0
                          then (greatest(stock_qty, 0) * avg_cost + p_change * p_unit_cost) / (greatest(stock_qty, 0) + p_change) else p_unit_cost end
      where id = v_ing.id;
  end if;
  update public.ingredients set stock_qty = stock_qty + p_change where id = v_ing.id;
  insert into public.stock_movements (restaurant_id, ingredient_id, change, reason, unit_cost, note, created_by)
  values (v_ing.restaurant_id, v_ing.id, p_change, p_reason, coalesce(p_unit_cost, v_ing.avg_cost), nullif(trim(coalesce(p_note, '')), ''),
          (select id from public.staff where user_id = auth.uid()))
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Receive (part of) a purchase order: adds stock and updates the weighted-average cost.
create or replace function public.receive_purchase_order(p_po_id uuid, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_po public.purchase_orders%rowtype;
  v_line jsonb;
  v_item public.purchase_order_items%rowtype;
  v_qty numeric(12,3);
  v_cost numeric(12,4);
  v_all boolean;
begin
  if not public.is_staff_manager() then raise exception 'Only owners and managers can receive stock.' using errcode = '42501'; end if;
  select * into v_po from public.purchase_orders where id = p_po_id and restaurant_id = public.current_staff_restaurant() for update;
  if not found then raise exception 'Purchase order not found.' using errcode = 'P0001'; end if;
  if v_po.status in ('received', 'cancelled') then raise exception 'This purchase order is already %.', v_po.status using errcode = 'P0001'; end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into v_item from public.purchase_order_items where id = (v_line->>'item_id')::uuid and purchase_order_id = v_po.id for update;
    if not found then raise exception 'A line does not belong to this purchase order.' using errcode = 'P0001'; end if;
    v_qty := coalesce((v_line->>'received_qty')::numeric, 0);
    if v_qty < 0 then raise exception 'Received quantity cannot be negative.' using errcode = 'P0001'; end if;
    if v_qty = 0 then continue; end if;
    v_cost := coalesce((v_line->>'unit_cost')::numeric, v_item.unit_cost);
    update public.ingredients i
      set avg_cost = case when greatest(i.stock_qty, 0) + v_qty > 0
                          then (greatest(i.stock_qty, 0) * i.avg_cost + v_qty * v_cost) / (greatest(i.stock_qty, 0) + v_qty) else v_cost end,
          stock_qty = i.stock_qty + v_qty
      where i.id = v_item.ingredient_id;
    insert into public.stock_movements (restaurant_id, ingredient_id, change, reason, purchase_order_id, unit_cost, created_by)
    values (v_po.restaurant_id, v_item.ingredient_id, v_qty, 'purchase', v_po.id, v_cost, (select id from public.staff where user_id = auth.uid()));
    update public.purchase_order_items set received_qty = received_qty + v_qty, unit_cost = v_cost where id = v_item.id;
  end loop;
  select bool_and(received_qty >= quantity) into v_all from public.purchase_order_items where purchase_order_id = v_po.id;
  update public.purchase_orders
    set status = case when v_all then 'received' else 'partially_received' end,
        received_at = case when v_all then now() else received_at end,
        total = (select coalesce(sum(quantity * unit_cost), 0) from public.purchase_order_items where purchase_order_id = v_po.id)
    where id = v_po.id returning * into v_po;
  return to_jsonb(v_po);
end $$;

revoke all on function public.record_stock_movement(uuid, numeric, text, text, numeric) from public;
grant execute on function public.record_stock_movement(uuid, numeric, text, text, numeric) to authenticated, service_role;
revoke all on function public.receive_purchase_order(uuid, jsonb) from public;
grant execute on function public.receive_purchase_order(uuid, jsonb) to authenticated, service_role;

-- Food cost per dish (recipe × average ingredient cost). Runs as the caller.
create or replace function public.dish_costs(p_restaurant_id uuid)
returns table (menu_item_id uuid, food_cost numeric, ingredients integer)
language sql stable security invoker set search_path = public as $$
  select m.id, coalesce(sum(r.quantity * i.avg_cost), 0)::numeric(12,2), count(r.id)::int
  from public.menu_items m
  left join public.recipe_items r on r.menu_item_id = m.id
  left join public.ingredients i on i.id = r.ingredient_id
  where m.restaurant_id = p_restaurant_id
  group by m.id
$$;
revoke all on function public.dish_costs(uuid) from public;
grant execute on function public.dish_costs(uuid) to authenticated, service_role;

-- Realtime for the floor view, reservations and stock alerts.
do $$ begin alter publication supabase_realtime add table public.reservations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.waitlist; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.bills; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ingredients; exception when duplicate_object then null; end $$;

-- ===========================================================================
-- 12b. Bill preview (same maths as settle_bill, writes nothing)
-- ===========================================================================
create or replace function public.bill_preview(p_order_ids uuid[], p_discount_type text, p_discount_value numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rid uuid := public.current_staff_restaurant();
  v_rest public.restaurants%rowtype;
  v_o public.orders%rowtype;
  v_base_total numeric(12,2);
  v_extra numeric(12,2) := 0;
  v_left numeric(12,2);
  v_alloc numeric(12,2);
  v_i integer := 0;
  v_n integer;
  v_base numeric(12,2);
  v_service numeric(10,2);
  v_tax numeric(10,2);
  v_sub numeric(12,2) := 0; v_disc numeric(12,2) := 0; v_svc numeric(12,2) := 0; v_tx numeric(12,2) := 0; v_tot numeric(12,2) := 0;
begin
  if v_rid is null then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    return jsonb_build_object('subtotal', 0, 'discount', 0, 'extra_discount', 0, 'service_charge', 0, 'tax', 0, 'total', 0);
  end if;
  select * into v_rest from public.restaurants where id = v_rid;
  select sum(subtotal - discount_amount), count(*) into v_base_total, v_n
    from public.orders where id = any (p_order_ids) and restaurant_id = v_rid;
  if coalesce(p_discount_type, 'none') = 'percent' and coalesce(p_discount_value, 0) > 0 then
    v_extra := round(v_base_total * least(p_discount_value, 100) / 100, 2);
  elsif p_discount_type = 'flat' and coalesce(p_discount_value, 0) > 0 then
    v_extra := least(round(p_discount_value, 2), v_base_total);
  end if;
  v_left := v_extra;
  for v_o in select * from public.orders where id = any (p_order_ids) and restaurant_id = v_rid order by placed_at loop
    v_i := v_i + 1;
    if v_base_total > 0 and v_i < v_n then
      v_alloc := round(v_extra * (v_o.subtotal - v_o.discount_amount) / v_base_total, 2);
    else
      v_alloc := v_left;
    end if;
    v_left := v_left - v_alloc;
    v_base := v_o.subtotal - v_o.discount_amount - v_alloc;
    v_service := round(v_base * v_rest.service_charge_rate / 100, 2);
    v_tax := round((v_base + v_service) * v_rest.tax_rate / 100, 2);
    v_sub := v_sub + v_o.subtotal;
    v_disc := v_disc + v_o.discount_amount + v_alloc;
    v_svc := v_svc + v_service;
    v_tx := v_tx + v_tax;
    v_tot := v_tot + v_base + v_service + v_tax;
  end loop;
  return jsonb_build_object('subtotal', v_sub, 'discount', v_disc, 'extra_discount', v_extra, 'service_charge', v_svc, 'tax', v_tx, 'total', v_tot);
end $$;
revoke all on function public.bill_preview(uuid[], text, numeric) from public;
grant execute on function public.bill_preview(uuid[], text, numeric) to authenticated, service_role;

-- ===========================================================================
-- 12c. Audit log: written by triggers, so every path (dashboard, API, SQL) is recorded
-- ===========================================================================
create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff%rowtype;
  v_rid uuid;
  v_action text;
  v_detail jsonb := '{}'::jsonb;
  v_entity_id text;
begin
  select * into v_staff from public.staff where user_id = auth.uid();
  if tg_op = 'DELETE' then
    v_entity_id := old.id::text;
  else
    v_entity_id := new.id::text;
  end if;

  if tg_table_name = 'orders' then
    v_rid := new.restaurant_id;
    if new.status is distinct from old.status and new.status = 'cancelled' then
      v_action := 'order.cancelled';
      v_detail := jsonb_build_object('order_number', new.order_number, 'total', new.total, 'was', old.status);
    elsif new.payment_status is distinct from old.payment_status and new.payment_status in ('paid', 'refunded') and new.bill_id is null then
      v_action := 'order.payment_' || new.payment_status;
      v_detail := jsonb_build_object('order_number', new.order_number, 'total', new.total);
    elsif new.table_id is distinct from old.table_id then
      v_action := 'order.table_moved';
      v_detail := jsonb_build_object('order_number', new.order_number, 'from', old.table_id, 'to', new.table_id);
    else
      return null;
    end if;
  elsif tg_table_name = 'bills' then
    v_rid := new.restaurant_id;
    if tg_op = 'INSERT' then
      v_action := 'bill.settled';
      v_detail := jsonb_build_object('bill_number', new.bill_number, 'total', new.total, 'discount', new.discount_amount, 'tip', new.tip_amount, 'orders', cardinality(new.order_ids));
    elsif new.status = 'refunded' and old.status <> 'refunded' then
      v_action := 'bill.refunded';
      v_detail := jsonb_build_object('bill_number', new.bill_number, 'total', new.total, 'reason', new.refund_reason);
    else
      return null;
    end if;
  elsif tg_table_name = 'menu_items' then
    if tg_op = 'INSERT' then
      v_rid := new.restaurant_id;
      v_action := 'menu.item_added'; v_detail := jsonb_build_object('name', new.name, 'price', new.price);
    elsif tg_op = 'DELETE' then
      v_rid := old.restaurant_id;
      v_action := 'menu.item_deleted'; v_detail := jsonb_build_object('name', old.name, 'price', old.price);
    elsif new.price is distinct from old.price then
      v_rid := new.restaurant_id;
      v_action := 'menu.price_changed'; v_detail := jsonb_build_object('name', new.name, 'from', old.price, 'to', new.price);
    elsif new.is_available is distinct from old.is_available then
      v_rid := new.restaurant_id;
      v_action := case when new.is_available then 'menu.back_in_stock' else 'menu.sold_out' end; v_detail := jsonb_build_object('name', new.name);
    else
      return null;
    end if;
  elsif tg_table_name = 'staff' then
    if tg_op = 'INSERT' then
      v_rid := new.restaurant_id;
      v_action := 'staff.joined'; v_detail := jsonb_build_object('name', new.display_name, 'role', new.role);
    elsif tg_op = 'DELETE' then
      v_rid := old.restaurant_id;
      v_action := 'staff.removed'; v_detail := jsonb_build_object('name', old.display_name, 'role', old.role);
    elsif new.role is distinct from old.role then
      v_rid := new.restaurant_id;
      v_action := 'staff.role_changed'; v_detail := jsonb_build_object('name', new.display_name, 'from', old.role, 'to', new.role);
    else
      return null;
    end if;
  elsif tg_table_name = 'stock_movements' then
    if new.reason not in ('waste', 'adjustment', 'opening') then return null; end if;
    v_rid := new.restaurant_id;
    v_action := 'stock.' || new.reason;
    v_detail := jsonb_build_object('ingredient', (select name from public.ingredients where id = new.ingredient_id), 'change', new.change, 'note', new.note);
  elsif tg_table_name = 'cash_closings' then
    v_rid := new.restaurant_id;
    v_action := 'cash.day_closed';
    v_detail := jsonb_build_object('date', new.business_date, 'expected', new.expected_cash, 'counted', new.counted_cash, 'variance', new.variance);
  elsif tg_table_name = 'coupons' then
    -- A guest using a coupon only bumps used_count: not an edit worth logging.
    if tg_op = 'UPDATE' and (new.code, new.kind, new.value, new.min_order, new.max_discount, new.valid_from, new.valid_until, new.usage_limit, new.is_active)
       is not distinct from (old.code, old.kind, old.value, old.min_order, old.max_discount, old.valid_from, old.valid_until, old.usage_limit, old.is_active) then
      return null;
    end if;
    if tg_op = 'DELETE' then
      v_rid := old.restaurant_id; v_detail := jsonb_build_object('code', old.code);
    else
      v_rid := new.restaurant_id; v_detail := jsonb_build_object('code', new.code, 'active', new.is_active);
    end if;
    v_action := 'coupon.' || lower(tg_op);
  elsif tg_table_name = 'restaurants' then
    if new.tax_rate is not distinct from old.tax_rate and new.service_charge_rate is not distinct from old.service_charge_rate
       and new.upi_id is not distinct from old.upi_id and new.is_open is not distinct from old.is_open then
      return null;
    end if;
    v_rid := new.id;
    v_action := 'settings.changed';
    v_detail := jsonb_build_object('tax_rate', new.tax_rate, 'service_charge_rate', new.service_charge_rate, 'upi_changed', new.upi_id is distinct from old.upi_id, 'is_open', new.is_open);
  else
    return null;
  end if;

  insert into public.audit_log (restaurant_id, staff_id, actor_name, action, entity, entity_id, detail)
  values (v_rid, v_staff.id, coalesce(v_staff.display_name, case when auth.uid() is null then 'Guest / system' else 'Unknown' end),
          v_action, tg_table_name, v_entity_id, v_detail);
  return null;
end $$;

drop trigger if exists orders_audit on public.orders;
drop trigger if exists bills_audit on public.bills;
drop trigger if exists menu_items_audit on public.menu_items;
drop trigger if exists staff_audit on public.staff;
drop trigger if exists stock_movements_audit on public.stock_movements;
drop trigger if exists cash_closings_audit on public.cash_closings;
drop trigger if exists coupons_audit on public.coupons;
drop trigger if exists restaurants_audit on public.restaurants;
create trigger orders_audit after update on public.orders for each row execute function public.audit_row();
create trigger bills_audit after insert or update on public.bills for each row execute function public.audit_row();
create trigger menu_items_audit after insert or update or delete on public.menu_items for each row execute function public.audit_row();
create trigger staff_audit after insert or update or delete on public.staff for each row execute function public.audit_row();
create trigger stock_movements_audit after insert on public.stock_movements for each row execute function public.audit_row();
create trigger cash_closings_audit after insert on public.cash_closings for each row execute function public.audit_row();
create trigger coupons_audit after insert or update or delete on public.coupons for each row execute function public.audit_row();
create trigger restaurants_audit after update on public.restaurants for each row execute function public.audit_row();

-- ===========================================================================
-- 13. Demo café data
-- ===========================================================================
update public.restaurants set takeaway_enabled = true, reservations_enabled = true, open_time = '08:00', close_time = '23:30'
where slug = 'saffron-lane';

-- Breakfast-style category window example: Breads & Rice all day; nothing restricted by default.

insert into public.coupons (restaurant_id, code, description, kind, value, min_order, max_discount, usage_limit)
select id, 'WELCOME10', '10% off orders of ₹300 or more (up to ₹150)', 'percent', 10, 300, 150, 500 from public.restaurants where slug = 'saffron-lane'
on conflict (restaurant_id, code) do nothing;
insert into public.coupons (restaurant_id, code, description, kind, value, min_order)
select id, 'FLAT50', '₹50 off orders of ₹500 or more', 'flat', 50, 500 from public.restaurants where slug = 'saffron-lane'
on conflict (restaurant_id, code) do nothing;

insert into public.happy_hours (restaurant_id, name, days, start_time, end_time, percent, category_ids)
select r.id, 'Chai-time 20% off drinks', '{1,2,3,4,5}', '15:00', '18:00', 20, array[c.id]
from public.restaurants r join public.menu_categories c on c.restaurant_id = r.id and c.name = 'Drinks'
where r.slug = 'saffron-lane'
  and not exists (select 1 from public.happy_hours h where h.restaurant_id = r.id and h.name = 'Chai-time 20% off drinks');

insert into public.ingredients (restaurant_id, name, unit, stock_qty, low_stock_threshold, avg_cost)
select r.id, v.name, v.unit, v.qty, v.low, v.cost
from public.restaurants r, (values
  ('Paneer', 'kg', 8, 2, 380),
  ('Chicken (boneless)', 'kg', 10, 3, 280),
  ('Black lentils (urad)', 'kg', 6, 2, 140),
  ('Basmati rice', 'kg', 20, 5, 110),
  ('Butter', 'kg', 4, 1, 520),
  ('Fresh cream', 'l', 5, 1, 220),
  ('Tomatoes', 'kg', 12, 4, 40),
  ('Onions', 'kg', 15, 5, 35),
  ('Refined flour (maida)', 'kg', 25, 5, 45),
  ('Milk', 'l', 20, 5, 60),
  ('Tea leaves', 'kg', 2, 0.5, 600),
  ('Coffee beans', 'kg', 2, 0.5, 1200),
  ('Mozzarella', 'kg', 3, 1, 650),
  ('Potatoes', 'kg', 15, 5, 30)
) as v(name, unit, qty, low, cost)
where r.slug = 'saffron-lane'
on conflict (restaurant_id, name) do nothing;

insert into public.recipe_items (menu_item_id, ingredient_id, quantity)
select m.id, i.id, v.qty
from public.restaurants r
join (values
  ('Paneer Tikka', 'Paneer', 0.200), ('Paneer Tikka', 'Onions', 0.050),
  ('Paneer Butter Masala', 'Paneer', 0.180), ('Paneer Butter Masala', 'Butter', 0.030), ('Paneer Butter Masala', 'Tomatoes', 0.150), ('Paneer Butter Masala', 'Fresh cream', 0.040),
  ('Butter Chicken', 'Chicken (boneless)', 0.250), ('Butter Chicken', 'Butter', 0.040), ('Butter Chicken', 'Tomatoes', 0.150), ('Butter Chicken', 'Fresh cream', 0.050),
  ('Murgh Malai Tikka', 'Chicken (boneless)', 0.250), ('Murgh Malai Tikka', 'Fresh cream', 0.030),
  ('Emerald Dal Makhani', 'Black lentils (urad)', 0.120), ('Emerald Dal Makhani', 'Butter', 0.030), ('Emerald Dal Makhani', 'Fresh cream', 0.030),
  ('Hyderabadi Chicken Biryani', 'Basmati rice', 0.200), ('Hyderabadi Chicken Biryani', 'Chicken (boneless)', 0.200), ('Hyderabadi Chicken Biryani', 'Onions', 0.100),
  ('Jeera Rice', 'Basmati rice', 0.150),
  ('Butter Naan', 'Refined flour (maida)', 0.100), ('Butter Naan', 'Butter', 0.010),
  ('Garlic Naan', 'Refined flour (maida)', 0.100), ('Garlic Naan', 'Butter', 0.010),
  ('Margherita Pizza', 'Refined flour (maida)', 0.200), ('Margherita Pizza', 'Mozzarella', 0.120), ('Margherita Pizza', 'Tomatoes', 0.080),
  ('Masala Chai', 'Milk', 0.150), ('Masala Chai', 'Tea leaves', 0.005),
  ('Cappuccino', 'Milk', 0.180), ('Cappuccino', 'Coffee beans', 0.018),
  ('Cold Coffee', 'Milk', 0.250), ('Cold Coffee', 'Coffee beans', 0.015),
  ('Peri Peri Fries', 'Potatoes', 0.250),
  ('Punjabi Samosa (2 pc)', 'Potatoes', 0.150), ('Punjabi Samosa (2 pc)', 'Refined flour (maida)', 0.060)
) as v(dish, ing, qty) on true
join public.menu_items m on m.restaurant_id = r.id and m.name = v.dish
join public.ingredients i on i.restaurant_id = r.id and i.name = v.ing
where r.slug = 'saffron-lane'
on conflict (menu_item_id, ingredient_id) do nothing;

insert into public.suppliers (restaurant_id, name, contact_name, phone, notes)
select r.id, v.name, v.contact, v.phone, v.notes
from public.restaurants r, (values
  ('Koramangala Dairy', 'Suresh', null, 'Milk, paneer, butter, cream — daily 7 am'),
  ('Fresh Farms Vegetables', 'Lakshmi', null, 'Onions, tomatoes, potatoes'),
  ('Metro Wholesale', null, null, 'Rice, flour, lentils, tea, coffee')
) as v(name, contact, phone, notes)
where r.slug = 'saffron-lane'
  and not exists (select 1 from public.suppliers s where s.restaurant_id = r.id and s.name = v.name);

insert into public.gift_cards (restaurant_id, code, initial_value, balance, issued_to_name)
select id, 'GIFT-DEMO-500', 500, 500, 'Demo gift card' from public.restaurants where slug = 'saffron-lane'
on conflict (code) do nothing;

-- ---------- 0007_saas_platform_notifications.sql ----------
-- Restaurant OS — 0007: multi-restaurant SaaS (self-signup with a free trial, platform console,
-- public directory) and order notifications (Web Push for guests and staff).
-- Safe to run more than once.

-- ===========================================================================
-- 1. Restaurant profile fields for the SaaS
-- ===========================================================================
alter table public.restaurants
  add column if not exists city text,
  add column if not exists cuisine text,
  add column if not exists fssai_number text,
  -- Shown in the public directory at /restaurants (the restaurant opts in).
  add column if not exists listed boolean not null default false,
  -- active | suspended. Suspended restaurants cannot take orders. Set by the platform owner only.
  add column if not exists status text not null default 'active',
  -- End of the free trial; null = no trial (a paid plan, or set by the platform owner).
  add column if not exists trial_ends_at timestamptz;

do $$ begin
  alter table public.restaurants add constraint restaurants_status_check check (status in ('active', 'suspended'));
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- 2. Platform owners (you): add a row here for every account that may use /platform
--    insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';
-- ===========================================================================
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists "platform admins read self" on public.platform_admins;
create policy "platform admins read self" on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- Plan, status and trial are commercial settings: only the platform owner (or SQL) changes them.
create or replace function public.restaurants_guard_plan()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_platform_admin() then
    if new.plan is distinct from old.plan then
      raise exception 'Your plan is managed by Restaurant OS. Contact support to change it.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status or new.trial_ends_at is distinct from old.trial_ends_at then
      raise exception 'Account status is managed by Restaurant OS.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists restaurants_guard_plan on public.restaurants;
create trigger restaurants_guard_plan before update on public.restaurants
  for each row execute function public.restaurants_guard_plan();

-- A suspended restaurant takes no new orders (table QR, online takeaway or counter).
create or replace function public.orders_guard_restaurant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.restaurants where id = new.restaurant_id and status = 'suspended') then
    raise exception 'This restaurant is not taking orders right now.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists orders_guard_restaurant on public.orders;
create trigger orders_guard_restaurant before insert on public.orders
  for each row execute function public.orders_guard_restaurant();

-- Contact-form leads are read by the platform owner.
drop policy if exists "leads platform read" on public.leads;
create policy "leads platform read" on public.leads for select using (public.is_platform_admin());

-- ===========================================================================
-- 3. Self-signup: a signed-in account without a restaurant creates one
-- ===========================================================================
create or replace function public.slug_available(p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select lower(trim(coalesce(p_slug, ''))) ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and lower(trim(p_slug)) not in ('admin', 'api', 'platform', 'signup', 'restaurants', 'login', 'www', 'app', 'demo', 'new')
     and not exists (select 1 from public.restaurants where slug = lower(trim(p_slug)))
$$;
revoke all on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated, service_role;

create or replace function public.create_restaurant(
  p_name text,
  p_slug text,
  p_city text,
  p_phone text,
  p_owner_name text,
  p_tables integer,
  p_sample_menu boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_rid uuid;
  v_code text;
  v_i integer;
  v_src uuid;
  v_cat record;
  v_new_cat uuid;
  v_row public.restaurants%rowtype;
begin
  if v_uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if exists (select 1 from public.staff where user_id = v_uid) then
    raise exception 'This account already belongs to a restaurant. Open your dashboard instead.' using errcode = 'P0001';
  end if;
  if v_name is null or length(v_name) > 80 then raise exception 'Add your restaurant''s name (up to 80 characters).' using errcode = 'P0001'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'Your web address can use 3 to 40 lowercase letters, numbers and dashes.' using errcode = 'P0001';
  end if;
  if not public.slug_available(v_slug) then raise exception 'That web address is taken. Try another.' using errcode = 'P0001'; end if;
  if p_tables is null or p_tables < 1 or p_tables > 100 then raise exception 'Choose between 1 and 100 tables.' using errcode = 'P0001'; end if;

  insert into public.restaurants (slug, name, city, phone, plan, trial_ends_at, status, accepts_upi, accepts_counter, is_open)
  values (v_slug, v_name, nullif(trim(coalesce(p_city, '')), ''), nullif(trim(coalesce(p_phone, '')), ''),
          'premium', now() + interval '14 days', 'active', false, true, true)
  returning id into v_rid;

  insert into public.staff (user_id, restaurant_id, role, display_name)
  values (v_uid, v_rid, 'owner', coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), 'Owner'));

  for v_i in 1..p_tables loop
    loop
      v_code := substr(translate(upper(encode(extensions.gen_random_bytes(9), 'base64')), '+/=0O1IL', ''), 1, 6);
      exit when length(v_code) = 6 and not exists (select 1 from public.dining_tables where code = v_code);
    end loop;
    insert into public.dining_tables (restaurant_id, code, label, seats, sort_order)
    values (v_rid, v_code, 'Table ' || v_i, 4, v_i);
  end loop;

  -- Optional: copy the demo café's menu so the owner can edit instead of starting from nothing.
  if coalesce(p_sample_menu, false) then
    select id into v_src from public.restaurants where slug = 'saffron-lane';
    if v_src is not null then
      for v_cat in select * from public.menu_categories where restaurant_id = v_src order by sort_order loop
        insert into public.menu_categories (restaurant_id, name, description, name_hi, description_hi, sort_order, is_active,
                                            available_from, available_until, available_days)
        values (v_rid, v_cat.name, v_cat.description, v_cat.name_hi, v_cat.description_hi, v_cat.sort_order, v_cat.is_active,
                v_cat.available_from, v_cat.available_until, v_cat.available_days)
        returning id into v_new_cat;
        insert into public.menu_items (restaurant_id, category_id, name, description, name_hi, description_hi, price, image_url,
                                       is_veg, badges, option_groups, is_available, sort_order, prep_minutes, hsn_code)
        select v_rid, v_new_cat, name, description, name_hi, description_hi, price, image_url,
               is_veg, badges, option_groups, true, sort_order, prep_minutes, hsn_code
        from public.menu_items where category_id = v_cat.id;
      end loop;
    end if;
  end if;

  select * into v_row from public.restaurants where id = v_rid;
  return to_jsonb(v_row) - 'next_order_number' - 'next_bill_number';
end $$;
revoke all on function public.create_restaurant(text, text, text, text, text, integer, boolean) from public;
grant execute on function public.create_restaurant(text, text, text, text, text, integer, boolean) to authenticated, service_role;

-- ===========================================================================
-- 4. Platform console (owner of the SaaS)
-- ===========================================================================
create or replace function public.platform_overview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Only the Restaurant OS team can open this.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'restaurants', (select count(*) from public.restaurants),
    'active', (select count(*) from public.restaurants where status = 'active'),
    'suspended', (select count(*) from public.restaurants where status = 'suspended'),
    'on_trial', (select count(*) from public.restaurants where trial_ends_at > now()),
    'trial_expired', (select count(*) from public.restaurants where trial_ends_at <= now()),
    'listed', (select count(*) from public.restaurants where listed and status = 'active'),
    'by_plan', coalesce((select jsonb_object_agg(plan, n) from (select plan, count(*) n from public.restaurants group by plan) x), '{}'::jsonb),
    'signups_7d', (select count(*) from public.restaurants where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.restaurants where created_at > now() - interval '30 days'),
    'orders_30d', (select count(*) from public.orders where placed_at > now() - interval '30 days' and status <> 'cancelled'),
    'gmv_30d', coalesce((select sum(total) from public.orders where placed_at > now() - interval '30 days' and status <> 'cancelled'), 0),
    'orders_today', (select count(*) from public.orders where placed_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' and status <> 'cancelled'),
    'leads_30d', (select count(*) from public.leads where created_at > now() - interval '30 days')
  ) into v;
  return v;
end $$;

create or replace function public.platform_restaurants()
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Only the Restaurant OS team can open this.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into v from (
    select r.id, r.slug, r.name, r.city, r.phone, r.plan, r.status, r.listed, r.trial_ends_at, r.created_at, r.is_open,
      (select u.email from public.staff s join auth.users u on u.id = s.user_id
        where s.restaurant_id = r.id and s.role = 'owner' order by s.created_at limit 1) as owner_email,
      (select count(*) from public.staff s where s.restaurant_id = r.id) as staff_count,
      (select count(*) from public.dining_tables t where t.restaurant_id = r.id and t.is_active) as table_count,
      (select count(*) from public.menu_items m where m.restaurant_id = r.id) as dish_count,
      (select count(*) from public.orders o where o.restaurant_id = r.id and o.placed_at > now() - interval '30 days' and o.status <> 'cancelled') as orders_30d,
      coalesce((select sum(o.total) from public.orders o where o.restaurant_id = r.id and o.placed_at > now() - interval '30 days' and o.status <> 'cancelled'), 0) as gmv_30d,
      (select max(o.placed_at) from public.orders o where o.restaurant_id = r.id) as last_order_at
    from public.restaurants r
  ) x;
  return v;
end $$;

create or replace function public.platform_update_restaurant(
  p_id uuid,
  p_plan text default null,
  p_status text default null,
  p_trial_ends_at timestamptz default null,
  p_end_trial boolean default false,
  p_listed boolean default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.restaurants%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Only the Restaurant OS team can change this.' using errcode = '42501'; end if;
  if p_plan is not null and p_plan not in ('starter', 'growth', 'premium') then raise exception 'Unknown plan.' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('active', 'suspended') then raise exception 'Unknown status.' using errcode = 'P0001'; end if;
  update public.restaurants set
    plan = coalesce(p_plan, plan),
    status = coalesce(p_status, status),
    trial_ends_at = case when p_end_trial then null else coalesce(p_trial_ends_at, trial_ends_at) end,
    listed = coalesce(p_listed, listed)
  where id = p_id
  returning * into v_row;
  if not found then raise exception 'Restaurant not found.' using errcode = 'P0001'; end if;
  return to_jsonb(v_row) - 'next_order_number' - 'next_bill_number';
end $$;

create or replace function public.platform_leads(p_limit integer default 200)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Only the Restaurant OS team can open this.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc)
                   from (select * from public.leads order by created_at desc limit least(greatest(p_limit, 1), 1000)) l), '[]'::jsonb);
end $$;

revoke all on function public.platform_overview() from public;
revoke all on function public.platform_restaurants() from public;
revoke all on function public.platform_update_restaurant(uuid, text, text, timestamptz, boolean, boolean) from public;
revoke all on function public.platform_leads(integer) from public;
grant execute on function public.platform_overview() to authenticated, service_role;
grant execute on function public.platform_restaurants() to authenticated, service_role;
grant execute on function public.platform_update_restaurant(uuid, text, text, timestamptz, boolean, boolean) to authenticated, service_role;
grant execute on function public.platform_leads(integer) to authenticated, service_role;

-- ===========================================================================
-- 5. Web Push subscriptions (guests: order updates; staff: new orders and calls)
-- ===========================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  kind text not null check (kind in ('guest', 'staff')),
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  guest_session_id uuid,
  staff_id uuid references public.staff (id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check ((kind = 'guest') = (guest_session_id is not null)),
  check ((kind = 'staff') = (staff_id is not null))
);
create index if not exists push_subscriptions_restaurant_idx on public.push_subscriptions (restaurant_id, kind);
create index if not exists push_subscriptions_session_idx on public.push_subscriptions (guest_session_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push staff read" on public.push_subscriptions;
create policy "push staff read" on public.push_subscriptions for select using (restaurant_id = public.current_staff_restaurant());
drop policy if exists "push staff delete" on public.push_subscriptions;
create policy "push staff delete" on public.push_subscriptions for delete using (restaurant_id = public.current_staff_restaurant());

-- A guest's phone asks to hear about its orders at this restaurant.
create or replace function public.save_guest_push(
  p_table_code text, p_restaurant_slug text, p_guest_session_id uuid,
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rid uuid;
begin
  if p_guest_session_id is null then raise exception 'Missing session.' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(p_table_code, '')), '') is not null then
    select restaurant_id into v_rid from public.dining_tables where code = upper(trim(p_table_code)) and is_active;
  else
    select id into v_rid from public.restaurants where slug = lower(trim(coalesce(p_restaurant_slug, '')));
  end if;
  if v_rid is null then raise exception 'Restaurant not found.' using errcode = 'P0001'; end if;
  insert into public.push_subscriptions (restaurant_id, kind, endpoint, p256dh, auth, guest_session_id, user_agent)
  values (v_rid, 'guest', p_endpoint, p_p256dh, p_auth, p_guest_session_id, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    restaurant_id = excluded.restaurant_id, kind = 'guest', staff_id = null,
    guest_session_id = excluded.guest_session_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
  return true;
end $$;

-- A staff device asks to hear about new orders and waiter calls.
create or replace function public.save_staff_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff%rowtype;
begin
  select * into v_staff from public.staff where user_id = auth.uid();
  if not found then raise exception 'Sign in as staff first.' using errcode = '42501'; end if;
  insert into public.push_subscriptions (restaurant_id, kind, endpoint, p256dh, auth, staff_id, user_agent)
  values (v_staff.restaurant_id, 'staff', p_endpoint, p_p256dh, p_auth, v_staff.id, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    restaurant_id = excluded.restaurant_id, kind = 'staff', guest_session_id = null,
    staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
  return true;
end $$;

-- Knowing the endpoint is proof enough to stop it (the browser hands it only to its owner).
create or replace function public.drop_push_subscription(p_endpoint text)
returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from public.push_subscriptions where endpoint = p_endpoint returning 1)
  select exists (select 1 from d)
$$;

-- Staff devices to alert about a guest's brand-new order, added dishes or waiter call.
-- Only the guest who just made it can ask, and only for a few minutes.
create or replace function public.staff_push_targets(p_kind text, p_id uuid, p_guest_session_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = public as $$
declare v_rid uuid;
begin
  if p_kind = 'order' then
    select o.restaurant_id into v_rid from public.orders o
    where o.id = p_id and o.guest_session_id = p_guest_session_id
      and greatest(o.placed_at, coalesce(o.items_added_at, o.placed_at)) > now() - interval '5 minutes';
  elsif p_kind = 'call' then
    select c.restaurant_id into v_rid from public.assistance_calls c
    where c.id = p_id and c.guest_session_id = p_guest_session_id and c.created_at > now() - interval '5 minutes';
  end if;
  if v_rid is null then return; end if;
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s where s.restaurant_id = v_rid and s.kind = 'staff';
end $$;

revoke all on function public.save_guest_push(text, text, uuid, text, text, text, text) from public;
revoke all on function public.save_staff_push(text, text, text, text) from public;
revoke all on function public.drop_push_subscription(text) from public;
revoke all on function public.staff_push_targets(text, uuid, uuid) from public;
grant execute on function public.save_guest_push(text, text, uuid, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.save_staff_push(text, text, text, text) to authenticated, service_role;
grant execute on function public.drop_push_subscription(text) to anon, authenticated, service_role;
grant execute on function public.staff_push_targets(text, uuid, uuid) to anon, authenticated, service_role;

-- ===========================================================================
-- 6. Demo café: listed in the directory, with a city
-- ===========================================================================
update public.restaurants set city = coalesce(city, 'Bengaluru'), cuisine = coalesce(cuisine, 'North Indian · Café'), listed = true
where slug = 'saffron-lane';

-- ===========================================================================
-- 7. Deleting a whole restaurant: the activity log must not try to record the removal of its
--    staff and dishes against a restaurant that is going away (that failed with a foreign-key error).
-- ===========================================================================
do $$
declare d text;
begin
  d := pg_get_functiondef('public.audit_row()'::regprocedure);
  if position('restaurant being deleted' in d) = 0 then
    d := replace(d,
      '  insert into public.audit_log (restaurant_id, staff_id, actor_name, action, entity, entity_id, detail)',
      E'  -- Nothing to log when the whole restaurant (restaurant being deleted) is going away.\n  if not exists (select 1 from public.restaurants where id = v_rid) then return null; end if;\n  insert into public.audit_log (restaurant_id, staff_id, actor_name, action, entity, entity_id, detail)');
    if position('restaurant being deleted' in d) = 0 then raise exception 'audit_row patch did not apply'; end if;
    execute d;
  end if;
end $$;
