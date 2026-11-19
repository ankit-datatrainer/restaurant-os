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
