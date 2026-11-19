# Restaurant OS

Table QR ordering, counter POS, billing, reservations and inventory for cafés and restaurants. Guests scan the QR on their table, order from their phone, call a waiter in one tap, play a game while the food cooks, and pay by UPI or at the counter. The counter laptop chimes and reads every order aloud the second it lands. Staff can also take orders at the counter, run the floor, split and settle bills, close the cash drawer, track stock and see profit & loss.

**Stack:** Next.js 15 (App Router, React 19, Tailwind, framer-motion, GSAP, Lenis) · Express 4 + TypeScript · Supabase (Postgres, Auth, Realtime, Storage)

```
apps/web         Next.js app — marketing site, guest menu (/t/CODE), restaurant page (/r/SLUG), staff dashboard (/admin)
apps/api         Express API — public ordering endpoints + authenticated admin endpoints
packages/shared  Types, enums and money helpers shared by both
supabase/        migrations/0001…0006 (run in order), setup_full.sql (everything + demo data for a new project), seed.sql
```

## Run it locally

Requirements: Node 20+, npm 10+.

```bash
npm install
npm run dev
```

- Website: http://localhost:3000
- Guest demo table: http://localhost:3000/t/DEMO1 (tables DEMO1 … DEMO8 exist)
- Staff dashboard: http://localhost:3000/admin/login — demo login is in `apps/api/.env.example` (`DEMO_ADMIN_*`)
- API: http://localhost:4000/api/health

`npm run dev` starts both servers (API on 4000, web on 3000). The Next.js dev server proxies `/api/*` to the Express API, so the browser only ever talks to one origin.

Other scripts: `npm run typecheck`, `npm run build`, `npm run start`, `npm run seed` (needs a service-role key, see below).

## Environment

Both env files are filled in for your Supabase project (`https://twkxeamrehzwuaxnyfwg.supabase.co`):

- `apps/api/.env` — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`, `CORS_ORIGINS`, optional `SUPABASE_SERVICE_ROLE_KEY`
- `apps/web/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `API_PROXY_TARGET`

Templates: `apps/api/.env.example`, `apps/web/.env.example`.

The API works without a service-role key: public endpoints call `SECURITY DEFINER` Postgres functions, and admin endpoints forward the staff member's Supabase JWT so Row Level Security scopes every query to their restaurant. Add `SUPABASE_SERVICE_ROLE_KEY` only if you want `npm run seed` to create logins through the Admin API.

## Setting up a fresh Supabase project

1. Create a project, open the SQL editor and run `supabase/setup_full.sql` once (all migrations 0001–0006 plus the demo café and demo login). An existing project only needs the migrations it does not have yet, in order (the newest is `0006_pos_inventory_finance_staff.sql`).
2. Copy the project URL and anon/publishable key into the two env files.
3. `npm run dev`.

## How it works

**Guest** (`/t/CODE`, no login): the table code in the QR identifies the table. A random guest session id is kept in the phone's localStorage; every order carries it, so only that phone can look its orders up again. Prices are never trusted from the client — `place_order` recomputes everything from `menu_items`, applies option price deltas, service charge and GST (CGST + SGST halves), and assigns the next `#ORD-xxxx` number.

**Staff** (`/admin`): Supabase Auth (email + password). The dashboard subscribes to Postgres changes on `orders` and `assistance_calls` through Supabase Realtime (with a polling fallback), plays a synthesised chime and reads the order aloud with the browser's speech engine. Browsers block sound until a click, so the topbar has a "Start shift" button.

**Order flow:** placed → accepted → preparing → ready → served (or cancelled). **Payment:** pending → claimed (guest tapped "I've paid" after UPI) → paid (staff confirms) or refunded. A UPI order is never treated as paid until staff confirm it.

**Customer retention (Growth and Premium):** at checkout a guest may leave a mobile number, and separately tick an unticked box to receive WhatsApp offers. Each opt-in and opt-out is stored with the exact wording and date (`consent_events`). Every offer link carries an unsubscribe link (`/unsubscribe/<token>`). Staff see customers, visits, spend and ratings in **Customers**, can export CSV, and can open a pre-typed WhatsApp message for opted-in customers (they press send themselves; there is no automated sending yet).

**Counter POS & billing (every plan):** staff take dine-in or takeaway orders at the counter (`/admin/pos`; they go straight to the kitchen), watch every table on the **Floor** (free / ordering / in kitchen / served / bill requested / reserved), move or merge a table's orders, and settle one bill for the whole table with split payments (cash, UPI, card, gift card), a tip and — for owners and managers only — a discount. Bills are numbered (B-0001), refunds need a reason, a second screen (`/admin/display`) shows the guest the total and a UPI QR, and **Cash & accounts** closes the drawer each night (expected vs counted cash). **Staff & attendance** has invite codes, roles, clock in/out and an activity log written by database triggers (refunds, discounts, cancellations, price changes, stock adjustments). Owners can download a full JSON backup and an orders CSV.

**Growth adds** table reservations (staff + online requests from `/r/SLUG`, double-booking protection) and a walk-in waitlist, online takeaway with scheduled pickup, coupons, happy hours, gift cards, expenses, monthly budgets and a profit & loss statement. **Premium adds** inventory: ingredients, recipes, automatic stock deduction when the kitchen accepts an order (returned if it is cancelled), low-stock alerts, food cost % per dish, suppliers, purchase orders with part/full receiving and weighted-average cost, waste and stock counts.

**Feedback:** after an order is served the guest can rate it 1–5. Every guest who rates sees the restaurant's Google review link (never only the happy ones, no rewards), as Google's policy requires.

## Plans

Each restaurant has a `plan` (`starter`, `growth`, `premium`). Staff cannot change it from the dashboard; you set it:

```sql
update public.restaurants set plan = 'starter' where slug = 'saffron-lane';
```

Starter hides the CRM, WhatsApp consent, feedback, games, story video, the extra request types, reservations, online takeaway, promotions and expenses/P&L; Premium alone has inventory, loyalty, advanced reports, automated WhatsApp and POS webhooks. Prices live in `PLAN_INFO` / `FOUNDING_OFFER` in `packages/shared/src/index.ts` and drive both the website and the dashboard's Plan & billing page.

See [CHANGELOG.md](CHANGELOG.md) for every change made from the pricing & sales strategy, step by step.

## Deploying

- **Web:** Vercel (root `apps/web`). Set `NEXT_PUBLIC_*`, `NEXT_PUBLIC_API_URL` (the public API URL) and `NEXT_PUBLIC_SITE_URL`.
- **API:** Render / Railway / Fly (root `apps/api`, build `npm run build`, start `npm start`). Set `APP_URL` to the website URL (QR codes point there) and `CORS_ORIGINS`.
- **Database:** already on Supabase.

## Project layout highlights

- `apps/web/src/lib/api.ts` — the single typed client for every API call (the contract).
- `apps/web/src/components/ui` — buttons, sheets, badges, veg mark, reveal/count-up, magnetic buttons, smooth scroll.
- `apps/web/src/lib/audio.ts` — Web Audio chimes + SpeechSynthesis announcements.
- `apps/api/src/routes/public.ts`, `apps/api/src/routes/admin/*` — Express routes.
- `supabase/migrations/0001_init.sql` — schema, policies, `place_order` and friends.
- `supabase/migrations/0003_retention_plans_feedback.sql` — plans, customers + consent records, feedback, add-to-order, duplicate-order protection.
- `supabase/migrations/0006_pos_inventory_finance_staff.sql` — bills, POS orders, pricing engine (happy hours, coupons, serving windows), inventory, reservations, finance, staff, audit triggers.
