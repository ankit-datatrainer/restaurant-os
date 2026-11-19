# Restaurant OS — working notes for agents

Table-QR ordering for cafés and restaurants. Guests scan a table QR → order from their phone → the counter
dashboard chimes and reads the order aloud → staff move it through the kitchen → guest calls a waiter /
plays games while waiting → pays by UPI or at the counter.

## Stack and layout (npm workspaces)

```
apps/web        Next.js 15 (App Router, React 19, TypeScript, Tailwind 3.4, framer-motion, gsap, lenis, zustand, sonner, lucide-react)
apps/api        Express 4 + TypeScript (tsx in dev), zod, @supabase/supabase-js, qrcode, multer
packages/shared @restaurant-os/shared — types, enums, money helpers. Import with `import { … } from '@restaurant-os/shared'`
supabase/       migrations/0001…0006 (run in order; setup_full.sql = all of them + seed for a new project) + seed.sql
```

Run everything: `npm run dev` (API on :4000, web on :3000). Typecheck: `npm run typecheck`. Build: `npm run build`.
Env files already exist locally: `apps/api/.env`, `apps/web/.env.local` (Supabase URL + anon key filled in).

## Database (Supabase Postgres, see supabase/migrations/0001_init.sql)

Tables: `restaurants`, `staff` (auth user → restaurant, role), `dining_tables` (code, label, area), `menu_categories`,
`menu_items` (price, is_veg, badges[], option_groups jsonb, is_available), `orders`, `order_items`, `assistance_calls`, `leads`.

Guests never write tables directly. They call SECURITY DEFINER RPCs through the API:
`place_order`, `get_order`, `get_session_orders`, `claim_payment`, `create_assistance_call`. Prices are always
taken from `menu_items` inside `place_order`. Each order gets a per-restaurant `order_number` (#ORD-1001…).

Staff access is RLS-scoped by `current_staff_restaurant()`. Realtime is enabled on `orders`, `order_items`,
`assistance_calls`, `dining_tables`, `menu_items` (an authenticated supabase-js client receives its restaurant's rows).
Storage bucket `menu-images` is public-read, staff-write.

Operations (0006): `bills` + `bill_payments` (settle_bill merges orders, split tender, tip, manager discount; refund_bill),
`coupons`, `happy_hours`, `gift_cards` (+ transactions), `ingredients`, `recipe_items`, `stock_movements` (trigger `orders_stock`
deducts recipes when an order leaves `placed`, restores on cancel), `suppliers`, `purchase_orders` (+ items, receive_purchase_order
keeps a weighted-average cost), `reservations`, `waitlist`, `expenses`, `expense_budgets`, `cash_closings`, `staff_invites`,
`staff_shifts`, `audit_log` (written by trigger `audit_row` on orders/bills/menu_items/staff/stock_movements/cash_closings/coupons/restaurants).
Pricing for QR, takeaway and POS orders goes through `_price_order` (category serving windows, happy hours, coupons).
Orders: `table_id` is null for takeaway; `order_type` dine_in|takeaway, `source` qr|pos|online, `pickup_at`, `discount_amount`.

## API contract (Express, apps/api) — the web client in `apps/web/src/lib/api.ts` is the source of truth

Public (no auth):
- `GET  /api/public/tables/:code` → `TableMenuResponse` { restaurant, table, categories, items } (404 if inactive/unknown)
- `POST /api/public/orders` body `PlaceOrderInput` (+ optional `guest_phone`, `marketing_consent`, `consent_text`, `client_ref` idempotency uuid) → `OrderWithItems` (calls rpc place_order)
- `POST /api/public/orders/:id/items` body `AddItemsInput` → `OrderWithItems` (rpc add_order_items; only placed/accepted/preparing + payment pending; new lines get `round` 2+)
- `POST /api/public/orders/:id/feedback` body `FeedbackInput` → `OrderWithItems` with `feedback` (rpc submit_feedback; only when served)
- `GET  /api/public/orders?table=CODE&session=UUID` → `OrderWithItems[]` (rpc get_session_orders)
- `GET  /api/public/orders/:id?session=UUID` → `OrderWithItems` (rpc get_order; 404 if session mismatch; includes `feedback`)
- `POST /api/public/orders/:id/claim-payment` body { guest_session_id } → `OrderWithItems`
- `POST /api/public/calls` body `CreateCallInput` → `AssistanceCall`
- `GET  /api/public/calls?table=CODE&session=UUID` → `AssistanceCall[]` (guest's own, last 4 h; `status` attended = acknowledged)
- `GET/POST /api/public/unsubscribe/:token` → `UnsubscribeInfo` (POST revokes WhatsApp consent)
- `POST /api/public/leads` body { name, email, phone?, restaurant_name?, message?, city?, table_count?, plan_interest? } → `Lead`

Plans (migration 0003): `restaurant.plan` is `starter | growth | premium`, read-only for staff. Use `planHas(plan, feature)` from shared
(`crm`, `marketing`, `feedback`, `games`, `story`, `all_calls`, `customer_analytics` → Growth and Premium only). Prices: `PLAN_INFO`, `FOUNDING_OFFER`.
Consent rules: phone is optional; marketing consent is a separate unticked checkbox with `marketingConsentText(name)`; never opt anyone in on their behalf;
show the Google review link to every guest who leaves feedback (never only to high ratings), no incentives for reviews.

Admin (header `Authorization: Bearer <supabase access token>`, middleware `requireStaff` in src/middleware/auth.ts
attaches `req.auth = { staff, restaurant, db (RLS client), admin (service client or db) }`):
- `GET /api/admin/me` → `StaffSession` { staff, restaurant }
- `GET /api/admin/stats` → `DashboardStats`
- `GET /api/admin/orders?scope=active|past|all&status=&payment_status=&table_id=&q=&since=&until=&limit=` → `OrderWithItems[]` (newest first, max 300; include items + table, items sorted by `position`)
- `GET /api/admin/billing/summary?since=` → `BillingSummary` { count, paid, due, by_status } over every matching non-cancelled order (rpc billing_summary)
- `GET /api/admin/orders/:id` → `OrderWithItems`
- `PATCH /api/admin/orders/:id/status` { status } → `OrderWithItems` (validate transitions: forward along ORDER_FLOW, or → cancelled from non-served)
- `PATCH /api/admin/orders/:id/payment` { payment_status } → `OrderWithItems`
- `GET /api/admin/calls?status=open|attended|all` → `AssistanceCall[]` (include table)
- `PATCH /api/admin/calls/:id/attend` → `AssistanceCall`
- `GET/POST /api/admin/menu/categories`, `PATCH/DELETE /api/admin/menu/categories/:id`
- `GET/POST /api/admin/menu/items`, `PATCH/DELETE /api/admin/menu/items/:id`
- `POST /api/admin/menu/upload` multipart `file` → { url } (Supabase storage bucket menu-images)
- `GET/POST /api/admin/tables`, `PATCH/DELETE /api/admin/tables/:id` (DELETE → 204, or 200 with the row deactivated when it has order history), `POST /api/admin/tables/:id/reset-code`
- `GET /api/admin/tables/:id/qr.svg` and `.png` → QR image of `${APP_URL}/t/${code}` (needs auth header OR `?token=` query for <img> use)
- `GET/PATCH /api/admin/restaurant` → `Restaurant` (PATCH also takes google_review_url, story_title, story_text, story_video_url, games_enabled, feedback_enabled, marketing_consent_enabled; `plan` is ignored)
- `GET /api/admin/customers?segment=all|repeat|new|lapsed|opted_in&q=` → `CustomersResponse` { customers, summary } (Growth+, else 403)
- `GET /api/admin/customers/:id` → `CustomerDetail` { customer, orders, consent_events }
- `POST /api/admin/customers/:id/revoke-consent` → `CustomerSummary`
- `GET /api/admin/customers/export.csv?segment=&token=` → CSV download (token may be a query param)
- `GET /api/admin/feedback` → `FeedbackResponse` { entries, summary { count, average, distribution } } (Growth+)

Premium (migration 0005; 403 with an upgrade message on other plans; `planHas(plan, 'loyalty' | 'advanced_analytics' | 'whatsapp_automation' | 'pos_integration')`):
- `GET /api/public/loyalty?table=&session=` → `LoyaltyStatus` (guest card; `enabled:false` when not Premium / program off)
- `GET/PUT /api/admin/loyalty` → { program: `LoyaltyProgram`, stats } / `LoyaltyProgram`; `GET /api/admin/loyalty/rewards?status=active|redeemed|expired|all` → `LoyaltyReward[]` (with customer); `POST /api/admin/loyalty/rewards/:id/redeem`
- `GET /api/admin/analytics?from=&to=` → `AnalyticsReport` (default last 30 days, IST buckets, previous-period comparison)
- `GET/PUT /api/admin/integrations` → `IntegrationSettings` (owner/manager; WhatsApp token never returned, only `wa_token_set` + hint; webhook secret shown for copying); `POST /api/admin/integrations/webhook/rotate-secret`, `POST /api/admin/integrations/webhook/test`, `GET /api/admin/integrations/events`
- `POST /api/admin/automation/run` → `AutomationRunResult` (delivers pending webhooks + sends due WhatsApp journeys; the open dashboard calls it every ~2 min and after order events; a server timer does it when SUPABASE_SERVICE_ROLE_KEY is set)
- `GET /api/admin/whatsapp/messages`, `POST /api/admin/whatsapp/test` { to, kind? }, `POST /api/admin/whatsapp/broadcast` { segment?, message } (opted-in only, max 200)
- Menu items/categories carry `name_hi` / `description_hi` (all plans); guest UI falls back to English.

Operations (migration 0006). Plans: every plan gets POS/bills/floor/cash close/staff/audit/export; Growth+ `reservations`,
`online_takeaway`, `promotions`, `finance` (expenses, budgets, P&L); Premium `inventory`. Writes to promotions/inventory/finance are owner/manager only.
- `GET  /api/public/restaurants/:slug` → `RestaurantPageResponse` (restaurant page `/r/[slug]`: takeaway + booking); tables/:code also returns `happy_hours`
- `POST /api/public/quote` `QuoteInput` → `OrderQuote` (happy hour + coupon preview; `coupon_error` explains a rejected code)
- `POST /api/public/orders` also takes `order_type: 'takeaway'`, `restaurant_slug`, `pickup_at`, `coupon_code` (takeaway needs name + phone)
- `GET  /api/public/takeaway-orders?restaurant=&session=` → `OrderWithItems[]`; `POST /api/public/reservations` `ReservationRequestInput` → `ReservationRequestResult`
- `POST /api/admin/pos/orders` `PosOrderInput` → `OrderWithItems` (status accepted); `POST /api/admin/pos/quote` { items } → `OrderQuote`
- `POST /api/admin/bills/preview` → `BillPreview`; `POST /api/admin/bills` `SettleBillInput` → `BillWithDetails`; `GET /api/admin/bills?since=&until=&status=&q=`; `GET /api/admin/bills/:id`; `POST /api/admin/bills/:id/refund` { reason } (managers)
- `GET /api/admin/floor` → `FloorResponse`; `POST /api/admin/tables/:id/transfer` { to_table_id } → { moved }
- `GET/POST /api/admin/reservations`, `PATCH/DELETE /api/admin/reservations/:id` (double booking refused); `GET/POST /api/admin/waitlist`, `PATCH /api/admin/waitlist/:id`
- `/api/admin/coupons`, `/api/admin/happy-hours` (CRUD), `/api/admin/gift-cards` (GET ?q, POST, PATCH, GET :id/transactions)
- `/api/admin/inventory/ingredients` (CRUD; POST :id/movements { reason: waste|adjustment|opening, quantity }), `/movements`, `/recipes` (GET; PUT /recipes/:menuItemId { lines }), `/dish-costs`, `/suppliers` (CRUD), `/purchase-orders` (GET ?status, POST, PATCH :id, POST :id/receive)
- `/api/admin/finance/expenses` (CRUD), `GET/PUT /finance/budgets`, `GET /finance/cash-day?date=`, `POST /finance/cash-close`, `GET /finance/cash-closings`, `GET /finance/pnl?from=&to=` → `PnlReport`
- `GET /api/admin/staff`, `PATCH/DELETE /api/admin/staff/:id` (owner), `GET/POST /api/admin/staff-invites`, `DELETE /api/admin/staff-invites/:id`, `POST /api/admin/join` { code, display_name } (signed-in non-staff account; before requireStaff)
- `GET /api/admin/attendance/me`, `POST /api/admin/attendance/clock-in|clock-out`, `GET /api/admin/attendance?from=&to=&staff_id=`; `GET /api/admin/audit?limit=&entity=&before=` (managers)
- `GET /api/admin/export.json` (owner, full backup) and `GET /api/admin/export/orders.csv?from=&to=` (managers); both accept `?token=`
Webhook format and WhatsApp template variable order are documented at the top of `apps/api/src/services/webhooks.ts` and `whatsapp.ts`.

Errors are always `{ error: string, details?: unknown }` with a proper status (see src/lib/errors.ts).

## Web app routes (apps/web/src/app)

- `(marketing)/` → `/`, `/features`, `/pricing`, `/about`, `/contact`, `/demo` — dark premium site, Lenis smooth scroll, class `theme-dark`
- `t/[code]/` → guest menu (light, class `theme-light`): menu, cart sheet, order tracking, call waiter, games, bill
- `admin/` → staff dashboard (class `theme-admin`): login, dashboard, orders, floor, pos, kitchen, calls, reservations, menu, tables,
  inventory, promotions, billing (+ bills/[billId] receipt), finance, reports, customers, feedback, loyalty, staff, integrations, settings;
  outside the shell: `admin/kot/[orderId]`, `admin/display` (customer-facing screen via BroadcastChannel), `admin/join` (invite code)
- `r/[slug]/` → restaurant page (theme-light): online takeaway with scheduled pickup, table booking, `r/[slug]/orders` tracking

## Design system (apps/web/src/app/globals.css + tailwind.config.ts)

Fonts (self-hosted through Fontsource, CSS vars on `:root`): `font-display` Bricolage Grotesque (headlines), `font-sans` Manrope (body),
`font-serif` Instrument Serif (italic editorial accents only), `font-mono` JetBrains Mono (labels, numbers, eyebrows).
Colours: `ink` (dark base), `paper` (light base), accent `ember` (#FF5C2A) with `saffron` secondary; `mint` success, `rose` danger,
`sky` info; semantic `bg / fg / muted / line / surface / sunk` follow the active theme class (`theme-dark`, `theme-light`, `theme-admin`).
Utilities: `.gutter`, `.container-x`, `.eyebrow`, `.hairline`, `.glass`, `.grain`, `.tnum`, `.skeleton`, `.no-scrollbar`, `.text-gradient-ember`,
type sizes `text-display-xl/lg/md/sm`. Motion grammar lives in `src/lib/motion.ts` (EASE_OUT, spring, fadeUp, stagger, pop, sheetVariants).
UI primitives in `src/components/ui` (Button, Badge/VegMark/OrderStatusBadge, Sheet, Input/Textarea/Select/Toggle, Card/EmptyState/Skeleton,
DishImage, Reveal/SplitWords/CountUp, Magnetic/Tilt, SmoothScroll, Logo). Import via `@/components/ui`.

Helpers: `@/lib/utils` (cn, formatINR, orderCode, tableDisplay, timeAgo, tableUrl, demo), `@/lib/api` (publicApi, adminApi),
`@/lib/auth` (AuthProvider, useAuth), `@/lib/supabase` (getSupabase), `@/lib/session` (guest session id), `@/store/cart` (useCart),
`@/lib/audio` (unlockAudio, playChime, speak, orderAnnouncement, callAnnouncement).

## Conventions

- `'use client'` on anything using hooks/framer-motion. Server components only for static shells.
- Mobile first. Page body must never scroll horizontally. Use `.gutter` for side padding; respect `prefers-reduced-motion`.
- Copy: plain, specific, second person. No lorem ipsum, no fake testimonials presented as real.
- Money: rupees as numbers; format with `formatINR`. Tax = CGST + SGST split of `restaurant.tax_rate`.
- Do not add ESLint; typecheck with `tsc`. Do not change files outside your assigned area without being asked.
