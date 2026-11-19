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
