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
