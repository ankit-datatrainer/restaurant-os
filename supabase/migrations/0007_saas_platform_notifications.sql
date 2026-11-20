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
