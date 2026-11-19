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
