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
