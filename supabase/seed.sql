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
