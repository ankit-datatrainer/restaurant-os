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
