-- Restaurant OS — remove the rows left by the automated and browser tests on 26 Oct 2026.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once. Run it after 0006 is installed so the
-- round-3 part (POS, bills, inventory, bookings…) runs too; before 0006 that part is skipped.

-- Round 1 API test
delete from public.assistance_calls
  where guest_session_id in ('ceee4490-f1e5-4c1f-aed0-ffd3113fbada', 'e7e77680-f5d4-4cfb-86b5-cc0c22ae3cfc');
delete from public.orders   -- also removes their order items and feedback
  where guest_session_id in ('ceee4490-f1e5-4c1f-aed0-ffd3113fbada', 'e7e77680-f5d4-4cfb-86b5-cc0c22ae3cfc');
delete from public.customers   -- also removes their consent records and loyalty rewards
  where phone in ('+919876543210', '+919123456780');
delete from public.leads where email = 'lead-check@restaurantos.app';

-- Round 1 browser test (order #ORD-1003 at Table 5, guest +91 98111 00001)
delete from public.orders where id = '58736b9d-615c-499f-bfe7-ba7cc8c62866';
delete from public.customers where phone = '+919811100001';

-- Round 2 Premium API test (3 orders at Table 6, guest +91 98000 00077, test WhatsApp messages)
delete from public.orders where customer_id in (select id from public.customers where phone = '+919800000077');
delete from public.customers where phone = '+919800000077';
delete from public.whatsapp_messages where phone in ('+919800000077', '+919800000099');
delete from public.integration_events where delivered_at is not null or order_id is null;

-- Round 3 operations test (migration 0006): POS / takeaway orders, bill, gift card, test ingredient,
-- supplier + purchase order, expense, bookings, waitlist, test shift. Skipped automatically when 0006 is missing.
do $$
declare
  v_orders uuid[];
  v_bills uuid[];
begin
  if to_regclass('public.bills') is null then return; end if;

  select coalesce(array_agg(o.id), '{}') into v_orders
  from public.orders o
  left join public.customers c on c.id = o.customer_id
  where o.guest_name in ('Test Pickup', 'Walk-in test', 'Test table 6', 'Counter takeaway')
     or c.phone in ('+919800000066', '+919800000067', '+919800000068');
  select coalesce(array_agg(b.id), '{}') into v_bills from public.bills b where b.order_ids && v_orders;

  -- Put back the stock those test orders used, then drop their stock rows.
  with net as (
    select ingredient_id, sum(change) as c from public.stock_movements where order_id = any (v_orders) group by ingredient_id
  )
  update public.ingredients i set stock_qty = i.stock_qty - net.c from net where i.id = net.ingredient_id;
  delete from public.stock_movements where order_id = any (v_orders);

  delete from public.audit_log
   where entity_id = any (select unnest(v_orders)::text union all select unnest(v_bills)::text)
      or (entity = 'coupons' and detail->>'code' in ('TEST15', 'BAD150'))
      or (entity = 'stock_movements' and detail->>'ingredient' = 'Test Saffron');
  delete from public.gift_card_transactions where bill_id = any (v_bills)
     or gift_card_id in (select id from public.gift_cards where issued_to_name = 'Test gift');
  delete from public.gift_cards where issued_to_name = 'Test gift';
  update public.orders set bill_id = null where id = any (v_orders);
  delete from public.bills where id = any (v_bills);
  delete from public.orders where id = any (v_orders);

  delete from public.purchase_orders where supplier_id in (select id from public.suppliers where name = 'Test Spice Co');
  delete from public.suppliers where name = 'Test Spice Co';
  delete from public.ingredients where name = 'Test Saffron';
  delete from public.expenses where vendor = 'Test gas agency';
  delete from public.expense_budgets where category = 'gas' and amount = 5000;
  delete from public.reservations where phone in ('+919800000066', '+919800000067', '+919800000068');
  delete from public.waitlist where phone in ('+919800000066', '+919800000067', '+919800000068');
  delete from public.staff_shifts where note = 'Test shift';
  delete from public.customers where phone in ('+919800000066', '+919800000067', '+919800000068');

  -- The demo coupons were only used by the tests.
  update public.coupons set used_count = 0 where code in ('WELCOME10', 'FLAT50');
  update public.restaurants
    set next_bill_number = (select coalesce(max(bill_number), 0) + 1 from public.bills where restaurant_id = restaurants.id)
    where slug = 'saffron-lane';
end $$;

-- Next order number continues after the last real order.
update public.restaurants
  set next_order_number = (select coalesce(max(order_number), 1000) + 1 from public.orders where restaurant_id = restaurants.id)
  where slug = 'saffron-lane';

select
  (select count(*) from public.orders)            as orders_left,
  (select count(*) from public.customers)         as customers_left,
  (select count(*) from public.feedback)          as feedback_left,
  (select count(*) from public.loyalty_rewards)   as rewards_left,
  (select count(*) from public.whatsapp_messages) as whatsapp_messages_left;
