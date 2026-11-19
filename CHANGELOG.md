# Restaurant OS — change list

Changes made from the "Complete Business, Pricing & Sales Strategy" document, in the order they were built.
Each step says what changed, where, and how it was checked.

## What you still need to do

1. ~~Run 0004~~ and ~~0005~~ — done (verified on your project 26 Oct 2026).
2. ~~Run 0006~~ and ~~`cleanup_test_data.sql`~~ — done (verified on your project 26 Oct 2026, Step 22).
3. Before real guests: switch the demo café's takeaway / booking off (Settings) if you don't want them yet, and replace the demo coupons, happy hour, ingredients and suppliers with your own.
4. In the dashboard → Settings → Guest experience, replace the demo Google review link with your restaurant's real one (Google Business Profile → Ask for reviews).
5. Have the privacy notice (`/privacy`) reviewed by your legal advisor before real customers use it.

---

## Step 1 — Database (migration `supabase/migrations/0003_retention_plans_feedback.sql`)

| # | Change | Why (from the strategy doc) |
|---|---|---|
| 1.1 | `restaurants.plan` = `starter` / `growth` / `premium` (demo café is on Growth). A trigger blocks staff from changing their own plan. | Three paid tiers; features depend on the plan. |
| 1.2 | New restaurant settings: `google_review_url`, `story_title`, `story_text`, `story_video_url`, `games_enabled`, `feedback_enabled`, `marketing_consent_enabled`. | Google review link, restaurant story videos, games made optional. |
| 1.3 | New `customers` table (one profile per phone number per restaurant) with `marketing_consent`, consent date, revoke date and a private `unsubscribe_token`. | Customer CRM and repeat-business tracking. |
| 1.4 | New `consent_events` table: every opt-in and opt-out is recorded with the exact wording shown and where it came from (checkout, unsubscribe link, staff). | WhatsApp needs explicit opt-in, consent records and an unsubscribe mechanism. |
| 1.5 | `orders.client_ref` (unique per restaurant): the same checkout sent twice returns the same order. | "Handle duplicate orders" (operational reliability). |
| 1.6 | `add_order_items()` + `order_items.round` + `orders.items_added_at`: guests can add dishes to an order that is still open and unpaid; added dishes are marked as round 2, 3… | "Add items to an existing order" was marked **Critical**. |
| 1.7 | `get_session_calls()`: the guest's phone can see when staff mark a request as attended. | "Waiter-call acknowledgement" (High). |
| 1.8 | New `feedback` table + `submit_feedback()`: one 1–5 rating and comment per served order. | Feedback collection. |
| 1.9 | `get_unsubscribe()` / `unsubscribe_customer()` / `revoke_marketing_consent()` (staff can record an opt-out, never an opt-in). | Consent compliance. |
| 1.10 | `customer_list()`: visits, orders, total spent, last order and average rating per customer, computed from real orders. | Customer analytics. |
| 1.11 | `leads.city`, `leads.table_count`, `leads.plan_interest` (demo / founding partner). | Founding-partner applications from the website. |
| 1.12 | Row-level security on the three new tables (staff read only their own restaurant; guests write only through the functions above). | Customer privacy. |

**Checked:** 10 scripted database tests passed (consent stored only with the tick, duplicate checkout → one order, invalid phone rejected, add-items recalculates GST, wrong phone cannot add, feedback only after served, waiter acknowledgement visible, unsubscribe records an event, staff cannot change the plan). Test rows removed afterwards.

## Step 2 — Shared types + Express API

| # | Change | Files |
|---|---|---|
| 2.1 | Plan catalogue (`PLAN_INFO`: Starter ₹1,999 + ₹4,999 setup, Growth ₹3,999 + ₹9,999 setup / ₹39,990 a year, Premium ₹6,999 + ₹14,999 setup), `FOUNDING_OFFER` (Growth at ₹2,999 for the first 10 outlets, ₹4,999 onboarding, 14-day pilot, rate locked 12 months), `planHas()` feature check, consent wording, Indian phone helpers, WhatsApp click-to-chat link builder. | `packages/shared/src/index.ts` |
| 2.2 | `POST /api/public/orders` now accepts an optional phone, a separate marketing-consent tick (ignored without a phone), the exact consent wording and a `client_ref`. | `apps/api/src/routes/public.ts`, `services/schemas.ts` |
| 2.3 | New guest endpoints: `POST /orders/:id/items` (add dishes), `POST /orders/:id/feedback`, `GET /calls?table=&session=` (waiter acknowledgement), `GET`/`POST /unsubscribe/:token`. | `apps/api/src/routes/public.ts` |
| 2.4 | New admin endpoints (Growth+; Starter gets a clear 403 upgrade message): `GET /customers?segment=&q=` with summary (total, opted in, repeat rate, new this week, lapsed), `GET /customers/:id` (order + consent history), `POST /customers/:id/revoke-consent`, `GET /customers/export.csv` (with unsubscribe links), `GET /feedback` (average, star distribution, latest comments). | `apps/api/src/routes/admin/customers.ts`, `feedback.ts`, `services/plan.ts` |
| 2.5 | Settings API accepts the new guest-experience fields; `plan` is ignored if sent. | `services/schemas.ts` |
| 2.6 | Typed web client for all of the above. | `apps/web/src/lib/api.ts` |

**Checked:** API typecheck clean; 28/28 live API checks passed against the real database (see the test list in the session). Test data cleaned up.

## Step 3 — Moved to your own Supabase project

| # | Change | Files |
|---|---|---|
| 3.1 | One-shot setup script: all three migrations + demo data + demo login in a single file to paste into the Supabase SQL editor. | `supabase/setup_full.sql` |
| 3.2 | App now points at your project `twkxeamrehzwuaxnyfwg` with your publishable key. | `apps/api/.env`, `apps/web/.env.local` |
| 3.3 | Connection checker: confirms the project is reachable, the schema and menu are installed, row-level security is on, guest functions work and the demo staff login works. Run `node scripts/check-supabase.mjs`. | `scripts/check-supabase.mjs` |

**Checked:** after you ran `setup_full.sql`: connection check 8/8 passed (project reachable, schema + plans migration installed, 37 dishes, row-level security on, guest functions work, demo staff login works and is linked to the restaurant). Then the full API test ran against your project: 28/28 passed. The test left two test orders, two test customers, one rating and one lead; `supabase/cleanup_test_data.sql` removes them.

## Step 4 — Guest app (phone + WhatsApp consent, add dishes, waiter acknowledgement, feedback, story, optional games)

| # | Change | Files |
|---|---|---|
| 4.1 | Checkout: optional mobile number (+91, validated) and a separate **unticked** "Send me offers… on WhatsApp" box with the exact consent wording and a link to the privacy page. The box resets for every order; only the number is remembered for the visit. Every order carries a duplicate-protection key. | `components/guest/cart-sheet.tsx`, `lib/session.ts`, `store/cart.ts` |
| 4.2 | "Add dishes to this order" on the tracker while the order is open and unpaid. The menu shows an "Adding to order #…" banner; the cart then adds to that order. Added dishes appear under "Added later". | `tracker-screen.tsx`, `menu-screen.tsx`, `order-items.tsx`, `cart-bar.tsx` |
| 4.3 | Help requests show what staff did: "Requested · 2 min ago" → "On the way ✓", with a toast when staff respond. Starter shows only waiter and bill. | `use-session-calls.tsx`, `help-sheet.tsx`, `guest-shell.tsx` |
| 4.4 | After an order is served: 1–5 stars + comment. Every guest who rates sees the Google review link (no gating, no rewards). "Rate your meal" link on My orders. | `feedback-card.tsx`, `orders-screen.tsx` |
| 4.5 | "Our story" card (YouTube via youtube-nocookie, .mp4, or a link) on the tracker and a teaser on the menu. | `story-card.tsx` |
| 4.6 | Games hidden everywhere when the restaurant turns them off or is on Starter; game pages say they are switched off. | `fab-stack.tsx`, `games-gate.tsx`, `app/t/[code]/games/**` |
| 4.7 | Offline banner ("Orders and requests will go through once you're back online") and Place order disabled while offline. | `guest-shell.tsx`, `use-online.ts` |
| 4.8 | Unsubscribe page `/unsubscribe/<token>` (masked phone, one tap, confirmation). | `app/unsubscribe/[token]/page.tsx`, `unsubscribe-card.tsx` |
| 4.9 | UPI "claimed" always reads "Waiting for staff to confirm your payment"; "Paid" only after staff confirm. | `payment-block.tsx` |
| 4.10 | Duplicate protection for adding dishes too (a lost response + second tap no longer adds them twice). Needs `supabase/migrations/0004_add_items_idempotency.sql` on your project; until then the API falls back and adding still works. | `0004_add_items_idempotency.sql`, `routes/public.ts`, `cart-sheet.tsx` |

**Checked:** web typecheck clean. Browser test happens in Step 8.

## Step 5 — Staff dashboard (Customers, Feedback, Plan & billing, KOT, guest-experience settings)

| # | Change | Files |
|---|---|---|
| 5.1 | New menu items: **Customers**, **Feedback**, **Plan & billing**. Growth-only items show a lock on Starter; a plan chip sits under the restaurant name. | `nav.ts`, `sidebar.tsx`, `shell.tsx`, `plan.tsx` |
| 5.2 | **Customers**: tiles (customers, WhatsApp opted in, repeat rate, new this week, not seen in 30 days), segment tabs, search by name or phone, consent badges, CSV export. Each customer opens a drawer with visits, spend, rating, order history and consent history (wording, date, source); "Message on WhatsApp" only for opted-in customers (with an unsubscribe line); "Record unsubscribe request". | `customers-view.tsx`, `customer-sheet.tsx`, `crm.ts`, `crm-ui.tsx` |
| 5.3 | **Send an offer**: write once with {name}, pick an opted-in audience (all / repeat / not seen in 30 days), open each customer's WhatsApp with the message typed in, download the opted-in list. Clearly says staff press send and that automated journeys are on the Premium roadmap. | `offer-composer.tsx` |
| 5.4 | **Feedback**: average rating, star distribution, latest comments with table, order and guest. | `feedback-view.tsx` |
| 5.5 | Dashboard "Guests & retention" card (customers, opted in, repeat rate, average rating). | `retention-card.tsx`, `dashboard.tsx` |
| 5.6 | **Plan & billing**: current plan and what it includes, the three plans with setup fees, the founding-partner offer, what the subscription covers, what is billed separately, Premium items tagged "Rolling out". | `subscription-view.tsx` |
| 5.7 | Settings → **Guest experience**: Google review link, feedback on/off, games on/off, ask for WhatsApp consent on/off, story title / text / video. Disabled with an "In Growth" tag on Starter. | `settings-form.tsx` |
| 5.8 | Dishes added to an open order: shown under a saffron "Added" divider on order and kitchen cards; the dashboard chimes, reads "Table 1 added 2 dishes to order 1003" and shows a banner, once per addition. | `order-card.tsx`, `kitchen-board.tsx`, `admin-provider.tsx`, `notification-layer.tsx`, `use-sound.ts` |
| 5.9 | **KOT printing**: 80 mm kitchen ticket at `/admin/kot/<order>` (no prices), "Print KOT" and "Print add-on KOT" buttons on order and kitchen cards and on the "dishes added" banner. | `app/admin/kot/**`, `kot-ticket.tsx` |
| 5.10 | Everywhere "Guest says paid" appears: "check your UPI app before marking paid". Nothing marks UPI as paid automatically. | `order-card.tsx`, `billing-view.tsx`, `bill-view.tsx` |

**Checked:** web typecheck clean. Browser test happens in Step 8.

## Step 6 — Website (positioning, pricing, objections, privacy)

| # | Change | Files |
|---|---|---|
| 6.1 | New positioning: **Smart restaurant ordering & customer retention**. Hero now reads "From first order to *next visit.*"; site title, description and social previews updated; "Book a demo" in the nav. | `hero.tsx`, `app/layout.tsx`, `nav.tsx`, `mobile-menu.tsx`, `cta-band.tsx`, `footer.tsx` |
| 6.2 | New homepage sections: "What changes for the owner" (5 problem → fix → result rows, no salary/turnover claims), "From the first order to the next visit" retention flow with a clearly labelled illustrative example (200 diners/day → 6,000/month → 1,800 contacts, real consented contacts lower), "Built for these restaurants" (casual dining 15–40 tables, family, multi-outlet, theme & gaming cafés), "Feedback and reviews, done properly", "Extras you can switch off". | `components/marketing/home/*` |
| 6.3 | Features bento and marquee now include CRM, WhatsApp consent, feedback + Google link, add-to-order, waiter acknowledgement, KOT printing; "How it works" has a 5th step (rate the meal, come back). | `features-bento.tsx`, `marquee.tsx`, `how-it-works.tsx`, `micro/*` |
| 6.4 | Pricing rebuilt from the strategy: Starter ₹1,999 / Growth ₹3,999 (Recommended) / Premium ₹6,999 per outlet per month, each with its setup fee and "excl. GST"; Growth yearly ₹39,990; Premium advanced features tagged "Rolling out"; founding-partner offer band (₹2,999, ₹4,999 onboarding, 14-day pilot credited, 12-month lock); "What your subscription covers", "Billed separately", optional managed marketing by Peculiex; new pricing FAQ. Prices come from the same shared catalogue as the dashboard. | `plans.ts`, `plan-card.tsx`, `pricing/*`, `pricing-preview.tsx` |
| 6.5 | FAQ answers the owner objections honestly: we already have waiters, we already use Petpooja, customers won't scan, what if the internet stops (no offline ordering claimed), is ₹3,999 expensive, who owns the customer data. | `faq-data.ts` |
| 6.6 | Demo page: the 5-minute live demo script (scan → order → dashboard chime → call waiter + acknowledgement → rate, then Customers and Feedback). | `demo/demo-hub.tsx` |
| 6.7 | Contact: "Book a 5-minute demo with your menu", with City, Number of tables and "I'm interested in" (demo / founding partner / plan), preselected from links like `/contact?plan=founding_partner`. | `contact/contact-form.tsx`, `contact-aside.tsx` |
| 6.8 | New `/privacy` page in plain language (who controls data, what is stored, consent records, unsubscribing, Google reviews optional, deletion within 30 days after cancellation, security, never sold); linked from footer, checkout, contact and unsubscribe pages; added to the sitemap. | `app/(marketing)/privacy/page.tsx`, `sitemap.ts` |
| 6.9 | About page roadmap: "Now" (built today) vs "Next" (POS integrations, automated WhatsApp journeys, loyalty, advanced analytics, Hindi menu). | `about/roadmap.tsx` |

**Checked:** web typecheck clean; pages checked in the browser (Step 8).

## Step 7 — Fixes found during review and testing

| # | Fix | Files |
|---|---|---|
| 7.1 | Copy said the phone number is used "for order updates", but nothing is sent automatically. Reworded everywhere to "so the restaurant recognises you next time" / "Nothing is sent to your number automatically." | `privacy/page.tsx`, `cart-sheet.tsx`, `feature-sections.tsx`, `micro/consent-tick.tsx` |
| 7.2 | The unsubscribe page could stay stuck on its loading skeleton (it waited for an exit animation). It now shows the result as soon as it arrives. | `components/guest/unsubscribe-card.tsx` |
| 7.3 | The connection checker crashed on exit on Windows; rewritten to exit cleanly. | `scripts/check-supabase.mjs` |

## Step 8 — Full test on your Supabase project

| Check | Result |
|---|---|
| `npm run typecheck` (API + web) | Clean |
| `next build` (production build) | Succeeded, 35 pages |
| Connection check (`node scripts/check-supabase.mjs`) | 8/8 passed |
| Live API test (28 checks: consent, duplicates, add-items, waiter ack, feedback, CRM, CSV, unsubscribe, plan lock, leads) | 28/28 passed |
| Browser: homepage with new hero and sections | Correct |
| Browser: guest checkout — phone field, WhatsApp box appears only with a valid number and starts unticked, privacy link | Correct |
| Browser: order placed with consent → tracker with "Add dishes" card and "Our story" | Correct (#ORD-1003) |
| Browser: add a dish to the open order → "Added later" section, total updated to ₹798 incl. GST | Correct |
| Browser: dashboard order card shows "+ Dishes added", "Added 4:09 AM" divider, Print KOT / Print add-on KOT | Correct |
| Browser: KOT ticket (table, time, dishes, add-on section, no prices) | Correct |
| Browser: staff move order to served → guest phone updates by itself and asks "How was your meal?" | Correct |
| Browser: 2-star rating → Google review link still shown (no gating) | Correct |
| Browser: Customers page — visits, spend, rating, "Opted in", consent history with exact wording, WhatsApp message with unsubscribe link | Correct |
| Browser: unsubscribe link → masked phone → "Done" | Correct (after fix 7.2) |
| Browser: Feedback page (average, distribution, comments), Plan & billing, Settings → Guest experience, Pricing, Privacy | Correct |
| Server error log during the whole test | No errors |

---

# Round 2 — the five features that were still missing (Ludo, POS integration, automated WhatsApp, loyalty, advanced analytics) + Hindi menu

## Step 9 — Database (migration `supabase/migrations/0005_hindi_loyalty_analytics_integrations.sql`)

| # | Change |
|---|---|
| 9.1 | Hindi menu: `name_hi` / `description_hi` on dishes and categories (all plans). The demo menu is fully translated (37 dishes, 6 categories). |
| 9.2 | Loyalty: `loyalty_programs` (every N visits → reward, reward text, validity days) and `loyalty_rewards` (6-character code, expiry, redeemed). A database trigger creates the reward automatically when the qualifying order is marked served. `get_loyalty_status()` for the guest's card, `redeem_loyalty_reward()` for staff (cannot be redeemed twice). |
| 9.3 | POS / webhook integration: `restaurant_integrations` (webhook URL + auto-generated signing secret) and an `integration_events` outbox filled by a trigger on every order event (placed, dishes added, status, cancelled, payment). |
| 9.4 | Automated WhatsApp: WhatsApp Cloud API settings (phone number ID, access token, template names, language, win-back days), `whatsapp_messages` log with a unique de-duplication key, and `due_whatsapp_journeys()` (welcome after opt-in, win-back after N days, reward unlocked) — opted-in customers only. |
| 9.5 | Advanced analytics: `analytics_report()` returns one report for any date range (IST): totals with previous-period comparison, daily revenue, day × hour heatmap, dishes, payments, service speed, new vs returning customers, tables, ratings, loyalty and WhatsApp counts. |
| 9.6 | Row-level security on all new tables; integration credentials readable only by owners and managers. |
| 9.7 | Demo café moved to Premium with loyalty switched on (every 5th visit → a free dessert). |

**Checked (on a staging copy of the database, not your project):** applied cleanly; scripted test passed — Hindi rows, program advertised before linking, reward issued on the Nth served visit, guest card correct, 6 outbox events for 3 orders, journeys due (welcome + reward), analytics report, double redeem refused. Test rows removed.

## Step 10 — Shared types + Express API

| # | Change | Files |
|---|---|---|
| 10.1 | Plan features: Premium now includes `advanced_analytics`, `loyalty`, `whatsapp_automation`, `pos_integration`; new types for loyalty, integrations, automation results and the analytics report. | `packages/shared/src/index.ts` |
| 10.2 | Guest loyalty card endpoint `GET /api/public/loyalty`. | `routes/public.ts` |
| 10.3 | Loyalty admin: program settings, rewards list (active / redeemed / expired), redeem; rewards in the customer drawer. | `routes/admin/loyalty.ts`, `customers.ts` |
| 10.4 | Reports: `GET /api/admin/analytics?from=&to=` (default last 30 days, max 400). | `routes/admin/analytics.ts` |
| 10.5 | Webhooks: signed with HMAC-SHA256 (`X-RestaurantOS-Signature`), event + delivery headers, retries after 1, 5, 30, 120, 360, 720 minutes, delivery log, test ping, rotate secret. | `services/webhooks.ts`, `routes/admin/integrations.ts` |
| 10.6 | WhatsApp Cloud API sender (official Meta endpoint) with template variables in a fixed, documented order; welcome / win-back / reward journeys; test message; offer broadcast to opted-in customers only (max 200 at a time); every message carries the unsubscribe link; failures logged with Meta's exact error and retried at most once a day. Access token is never sent back to the browser. | `services/whatsapp.ts`, `services/automation.ts`, `routes/admin/integrations.ts` |
| 10.7 | Automation run endpoint (webhooks + journeys). Runs from the open dashboard; with a service-role key the server also runs it every 2 minutes. | `routes/admin/integrations.ts`, `src/index.ts` |
| 10.8 | Menu API accepts Hindi names/descriptions. | `services/schemas.ts` |

**Checked:** API typecheck clean; live test against staging with a local mock POS receiver and a mock WhatsApp API: 28/28 (Hindi menu + edit, settings saved with the token never returned, test ping signed correctly, 15 order webhooks delivered and all signatures valid, loyalty card 3 visits → 1 reward, welcome + reward WhatsApp messages with correct variables and unsubscribe link, second run sends nothing (de-duplicated), redeem once only, analytics numbers, invalid range refused, test message, broadcast only to opted-in customers, a bad token shows Meta's real error, message and delivery logs).

## Step 11 — Guest app: Ludo, Hindi menu, loyalty card

| # | Change | Files |
|---|---|---|
| 11.1 | **Ludo** at `/t/<table>/games/ludo`: classic 15×15 board, 2–4 players on one phone, each seat human or computer (default: you vs computer), real rules (6 to leave the yard, extra roll on a 6, three 6s forfeits, captures, safe stars, exact roll home), animated dice and step-by-step token moves, keyboard controls, saved game and wins per colour. Rules engine checked with 300 computer-only games. | `components/games/ludo/*`, `app/t/[code]/games/ludo/page.tsx`, `games-hub.tsx` |
| 11.2 | **Hindi menu**: "EN / हिं" switch on the menu (shown when the menu has Hindi), remembered on the phone; Hindi dish and category names and descriptions (English fallback per field), Hindi buttons and labels across menu, dish sheet, cart bar and checkout, Hindi dish badges, search in both scripts, proper Devanagari font (Noto Sans Devanagari). The consent sentence stays exactly as written. | `components/guest/i18n.ts` + guest screens, `ui/badge.tsx`, `app/layout.tsx`, `globals.css` |
| 11.3 | **Loyalty card** on the tracker and My orders: stamps for visits, "N more visits to …" or "Reward unlocked!", ticket with the reward code and valid-till date, small celebration the first time; at checkout the phone field says "every Nth visit gets …" before the guest is linked. | `loyalty-card.tsx`, `use-loyalty.ts`, `cart-sheet.tsx`, `tracker-screen.tsx`, `orders-screen.tsx` |

## Step 12 — Staff dashboard: Reports, Loyalty, Integrations, Hindi fields

| # | Change | Files |
|---|---|---|
| 12.1 | **Reports** (Premium): Today / 7 / 30 / 90 days / This month / Custom (IST); KPI tiles with change vs the previous period; revenue-by-day chart; busiest day × hour heatmap; top 10 dishes and slow movers; payments, service speed, new vs returning customers, tables, rating, loyalty and WhatsApp stats; CSV downloads. | `reports-view.tsx`, `app/admin/(app)/reports` |
| 12.2 | **Loyalty** (Premium): program settings (every N visits, reward, validity), active/redeemed counts, rewards list with search and Redeem (confirm); rewards also in each customer's drawer. | `loyalty-view.tsx`, `customer-sheet.tsx`, `app/admin/(app)/loyalty` |
| 12.3 | **Integrations** (Premium, owners/managers): POS & webhooks (URL, signing secret with reveal/copy/rotate, send test, developer docs with a signature-check snippet, delivery log) and WhatsApp Cloud API (setup checklist with Meta links, phone number ID, token saved but never shown again, template names with the required variables and suggested texts, test message, Run now, message log). | `integrations-view.tsx`, `whatsapp-templates.ts`, `app/admin/(app)/integrations` |
| 12.4 | **Automation runner**: the open dashboard runs webhook delivery + WhatsApp journeys every 2 minutes and a few seconds after each order event (owners/managers on Premium); last run shown on Integrations. | `use-automation.ts`, `admin-provider.tsx` |
| 12.5 | Customers → Send an offer: new "Send automatically via WhatsApp" mode (opted-in customers only, confirm with audience count, max 200) next to the manual click-to-chat mode. | `offer-composer.tsx` |
| 12.6 | Hindi name / description fields for dishes and Hindi name for categories; "हिं" chip on translated dishes. | `item-editor.tsx`, `category-list.tsx`, `menu-manager.tsx` |
| 12.7 | Navigation: Reports, Loyalty, Integrations (Premium locks; Integrations hidden from kitchen/waiter roles). Plan & billing lists the four Premium features as included, with the Meta and POS-vendor notes. | `nav.ts`, `sidebar.tsx`, `shell.tsx`, `plan.tsx`, `subscription-view.tsx` |

## Step 13 — Website

| # | Change |
|---|---|
| 13.1 | Pricing, comparison table, plan cards and Plan FAQ: Premium now includes advanced analytics, loyalty rewards, automated WhatsApp (own Meta account; Meta conversation fees billed by Meta), POS/webhook integration — "Rolling out" tags removed. Hindi menu in every plan; Ludo in games. |
| 13.2 | FAQ: honest POS answer (webhooks today; native Petpooja/other connectors need the vendor's partner API), new answers on automatic WhatsApp, loyalty and the Hindi menu. Offline ordering is still described as not available. |
| 13.3 | Features bento (Hindi menu and loyalty cards), marquee, feature sections (new "For the owner · Premium" section), Built for India (Hindi available), About roadmap (built items moved to Now; Next = native POS connectors, offline ordering, payment gateway with automatic UPI confirmation, central multi-outlet menu, more languages, QSR pickup flow), demo script (try हिं and Ludo, open Reports). |
| 13.4 | Privacy page updated: a number alone never triggers messages; automated messages go only to opted-in guests from the restaurant's own WhatsApp account via Meta; data shared with a POS only when the restaurant connects one. |

## Step 14 — Checks for round 2

| Check | Result |
|---|---|
| `npm run typecheck` (API + web) | Clean |
| `next build` | Succeeded (new pages: /admin/reports, /admin/loyalty, /admin/integrations, /t/[code]/games/ludo) |
| SQL migration 0005 on a staging copy | Applied; scripted test passed |
| Live API test (28 checks, with a mock POS receiver and a mock WhatsApp API) | 28/28 |
| Browser (app pointed at the staging copy, because your project does not have 0005 yet) | Hindi switch translates menu, badges and buttons with the Devanagari font; Ludo board and turn flow; Reports with real totals and period comparison; Loyalty page; Integrations page with the automation runner reporting "just now"; guest loyalty card showing "Reward unlocked!" with the code |
| Fixes during round 2 | Integration settings now create the signing secret on first open; webhook retry comment corrected; Hindi dish badges; Devanagari font |
| Not possible to test here | Real WhatsApp delivery (needs your Meta Business account and approved templates) and a real POS (needs your POS's webhook URL). Both code paths were tested against mock servers that behave like the real APIs. |

## Step 15 — Verified on your Supabase project (after you ran 0005)

| Check | Result |
|---|---|
| Connection check (`node scripts/check-supabase.mjs`, now also checks 0004 and 0005) | 11/11 passed — plan Premium, 37 dishes in Hindi, loyalty functions, add-to-order duplicate protection |
| Premium API test on your project (mock POS receiver + mock WhatsApp API, nothing sent to real phones) | 30/30 passed, then webhooks and WhatsApp switched back off, token removed, loyalty restored to every 5 visits / free dessert |
| Browser on your project | Hindi menu (first tap now works — see fix 15.1), Reports with your data, Loyalty program and rewards, Integrations with the automatic runner active |
| 15.1 Fix | The menu's loading screen stayed mounted invisibly after fading when its animation stalled (background tab / slow phone) and swallowed the guest's first tap anywhere on the menu. It now stops catching taps the moment it starts fading and removes itself on a timer. (`components/guest/splash.tsx`) |
| 15.2 | `supabase/cleanup_test_data.sql` now also removes the round-2 test rows (3 orders, test guest, test WhatsApp messages, delivered webhook events). |

---

# Round 3 — POS, billing, inventory, reservations, accounts, staff (26 Oct 2026)

Every feature of the open-source restaurant POS you sent (Nodedr OrderRestro) was mapped against Restaurant OS, and the
missing ones were built in our own code, in our design, on top of the existing QR ordering. Their code is AGPL-licensed, so none
of it was copied.

## Step 16 — Database (migration `supabase/migrations/0006_pos_inventory_finance_staff.sql`)

| # | Change |
|---|---|
| 16.1 | Orders can now be **takeaway** (no table), come from the **counter POS** or **online**, carry a **pickup time**, a **discount** (amount + reason), a **coupon** and the **bill** they were settled on. |
| 16.2 | One **pricing engine** (`_price_order`) for QR, takeaway and POS orders: live menu prices, **category serving windows** (e.g. breakfast till 11 AM), **happy hours** and **coupons** (min order, max discount, validity, usage limit). `quote_order` shows the price before ordering and explains a refused coupon. |
| 16.3 | **Bills**: `settle_bill` merges one or more orders into a numbered bill (B-0001…), optional **manager-only discount** spread across the orders, **tip**, and **split payment** across cash / UPI / card / gift card / other — the payments must add up exactly. `refund_bill` needs a reason and puts gift-card money back. `bill_preview` does the same maths without saving. |
| 16.4 | **Counter orders** (`staff_place_order`) go straight to the kitchen as accepted. **Table transfer / merge** (`transfer_table_orders`). |
| 16.5 | **Inventory**: ingredients (unit, stock, low-stock level, weighted-average cost), recipes per dish, stock movements. Stock is **deducted automatically** when the kitchen accepts an order and **returned** if it is cancelled; added dishes are deducted too. Waste, stock counts, opening stock (`record_stock_movement`). **Suppliers** and **purchase orders** with part/full receiving that updates stock and average cost (`receive_purchase_order`). Food cost per dish (`dish_costs`). |
| 16.6 | **Reservations** (requested → confirmed → seated → completed / cancelled / no-show) and a **walk-in waitlist**. Online booking requests (`request_reservation`): at least 30 min ahead, within opening hours, max 3 upcoming per phone. |
| 16.7 | **Accounts**: expenses by category, monthly budgets, **daily cash close** with expected vs counted cash and the difference (`cash_day_summary`, `close_cash_day`), **profit & loss** (`pnl_report`). |
| 16.8 | **Staff**: invite codes (8 characters, 7 days, one use), role changes and removal (owner only), **clock in / clock out** shifts. |
| 16.9 | **Activity log** written by database triggers, so nothing can skip it: bills settled/refunded, orders cancelled or moved, price changes, sold out / back, staff joined/removed/role changes, stock waste/counts, cash closings, coupon changes, tax/UPI/open settings. |
| 16.10 | Restaurant settings: takeaway on/off + prep minutes, bookings on/off + booking length, opening and closing time. Dish **HSN/SAC code**. |
| 16.11 | Row-level security on all 20 new tables (staff see only their restaurant; writes to promotions/inventory/accounts are owners and managers only). Online takeaway and booking are refused on the Starter plan even if the switch was left on. |
| 16.12 | Demo café: takeaway and booking on, hours 8:00 AM – 11:30 PM, coupons WELCOME10 and FLAT50, a weekday "Chai-time 20% off drinks" happy hour (3–6 PM), 14 ingredients, recipes for 15 dishes, 3 suppliers, gift card GIFT-DEMO-500. |

**Checked on the staging copy:** an end-to-end SQL test, then 87 API checks (below), then the browser. All 30 functions in the file were compared with the tested copy: identical.

## Step 17 — Shared types + API

| # | Change | Files |
|---|---|---|
| 17.1 | New types and helpers for bills, payments, coupons, happy hours, gift cards, inventory, reservations, expenses, cash close, P&L, staff, shifts, audit; `windowOpen`, `formatClock`, `billCode`, `poCode`. Plans: Growth gains reservations, online takeaway, promotions, expenses & P&L; Premium gains inventory. | `packages/shared/src/index.ts` |
| 17.2 | Guest endpoints: restaurant page, live quote, takeaway orders, booking requests; table menu returns happy hours; place order takes takeaway, pickup time and coupon. | `apps/api/src/routes/public.ts` |
| 17.3 | Staff endpoints: POS order + quote, bill preview / settle / list / detail / refund, floor, table transfer. | `routes/admin/pos.ts` |
| 17.4 | Reservations + waitlist (double booking of a table refused). | `routes/admin/reservations.ts` |
| 17.5 | Coupons, happy hours, gift cards (codes like GIFT-7KQ2-M9XD). | `routes/admin/promotions.ts` |
| 17.6 | Ingredients, stock movements, recipes, food cost, suppliers, purchase orders, receiving. | `routes/admin/inventory.ts` |
| 17.7 | Expenses, budgets, cash day + close, closings history, P&L (never subtracts ingredient cost twice). | `routes/admin/finance.ts` |
| 17.8 | Team, invites, join with a code, clock in/out, timesheets, activity log, **full JSON backup** and **orders CSV**. | `routes/admin/staff.ts` |
| 17.9 | Settings accept the new fields; turning takeaway/booking on checks the plan. | `routes/admin/restaurant.ts`, `services/schemas.ts`, `services/plan.ts` |
| 17.10 | Typed client for every new endpoint. | `apps/web/src/lib/api.ts` |

## Step 18 — Staff dashboard

| # | Page | What it does |
|---|---|---|
| 18.1 | **Counter POS** `/admin/pos` | Menu with search (Enter adds), option picker, cart with notes, dine-in (table) or takeaway, guest name/phone, live total incl. happy hour, Send to kitchen → Print KOT / Settle now. |
| 18.2 | **Floor** `/admin/floor` | Every table coloured by state (free, ordering, in kitchen, served, bill requested, reserved), open total, time seated, calls, next booking; table sheet with Add items, Move / merge, Settle bill; unpaid takeaway strip. |
| 18.3 | **Settle bill** sheet | Pick orders (merge), discount (managers), tip 5/10%/custom, split payments, cash change to give, gift card codes, live preview with CGST/SGST; opened from POS, Floor and Live orders. |
| 18.4 | **Customer display** `/admin/display` | Second screen for the guest: welcome, bill with a UPI QR for the exact amount, thank-you. |
| 18.5 | **Billing → Settled bills** + **receipt** `/admin/billing/bills/[id]` | Bills by day with payment methods, tips and refunds; printable GST tax invoice with HSN codes; refund with a reason (managers). |
| 18.6 | Orders, kitchen board, KOT, invoices | Takeaway / counter / online badges, pickup time (earliest first), "Mark picked up", discount lines that add up. |
| 18.7 | **Reservations** `/admin/reservations` | Bookings by day with confirm / seat / no-show, WhatsApp confirmation link, new booking; walk-in waitlist with notify and seat. |
| 18.8 | **Inventory** `/admin/inventory` | Stock with low-stock alerts, waste, stock count, recipes with food cost %, purchase orders (draft → ordered → receive), suppliers, history. |
| 18.9 | **Promotions** `/admin/promotions` | Coupons, happy hours (live "Running now"), gift cards with a printable card and QR. |
| 18.10 | **Cash & accounts** `/admin/finance` | Cash close with a note counter, expenses, budgets with progress bars, profit & loss statement. |
| 18.11 | **Staff & attendance** `/admin/staff` + `/admin/join` | Team and roles, invite codes with a join link, clock in/out (also in the top bar), timesheets, activity log in plain sentences. |
| 18.12 | Settings, menu | Takeaway & booking switches, prep time, opening hours, restaurant page link + QR, backup + CSV download; category serving windows; dish HSN code. |
| 18.13 | Navigation | Sidebar in sections: Service · Menu & stock · Money · Guests · Team & setup. Plan page lists the new features per plan. |

## Step 19 — Guest side

| # | Change |
|---|---|
| 19.1 | **Restaurant page** `/r/saffron-lane`: open/closed now, **order takeaway** (ASAP or a scheduled slot, name + mobile, coupon, pay at counter or UPI) and **book a table** (party size, date, time slot, calendar file). `/r/<slug>/orders` tracks pickup orders live. |
| 19.2 | Table menu: happy-hour banner and "−20%" tags, dishes outside their serving time greyed out, **coupon box** in the cart with the live price and the reason a code doesn't apply; discount lines on the tracker and bill. Hindi strings added. |

## Step 20 — Website

Features page with 7 new sections and a module index, home "Runs your whole floor" section, pricing cards and comparison table
per plan, 4 new FAQs (POS/billing, offline — honest: needs internet, stock, booking/takeaway, data export), roadmap moved to "Now"
for everything built, and an honest "Not built yet" list.

## Step 21 — Checks for round 3

| Check | Result |
|---|---|
| `npm run typecheck` and `npm run build` | Clean; 12 new pages built |
| SQL end-to-end test on staging (POS order + stock, coupons, merge, split with gift card, refund, cash close, P&L, invites, shifts, audit, takeaway, booking) | Passed |
| API test on staging (`ops-test`) | **87 / 87** |
| Plan limits (staging switched to Starter for the test) | 11 / 11 — Growth/Premium features refused with a clear message, POS / bills / cash close / staff still work |
| Browser on staging | Counter order → Settle with 10% discount, 10% tip, UPI ₹300 + cash (change ₹9.80) → bill B-0002 → GST receipt; Floor, Inventory, Promotions, Cash close, Staff, Activity log, Reservations; restaurant page takeaway with WELCOME10 at phone size → tracking page; table cart coupon message |
| Fixes during round 3 | P&L left out today's expenses; bills now readable only by their own restaurant; online takeaway refused while closed; coupon use no longer floods the activity log; Starter can't take online orders/bookings; counter orders don't alert the screen that entered them and never show "Accept"; takeaway orders say "Picked up"; GST % on discounted bills |
| Test data | Removed from staging. `cleanup_test_data.sql` now also removes round-3 test rows (restores the stock they used). |
| Not built (and why) | Offline/LAN mode (cloud app), direct USB/ESC-POS printer drivers and cash drawer (browser printing works with thermal printers), multi-branch, delivery riders, scheduled report emails, maintenance and documents modules. |

## Step 22 — Verified on your Supabase project (after you ran 0006 and the cleanup)

| Check | Result |
|---|---|
| Connection check (`node scripts/check-supabase.mjs`, now also checks 0006) | **14 / 14** — 0006 installed, price preview callable, bills hidden from the public key |
| Read-only test of every new module (nothing written, so your cleanup stays clean) | **25 / 25** — restaurant page, coupon price preview (₹640 → ₹604.80), POS preview, floor, bills, inventory, recipes, suppliers, purchase orders, coupons, happy hour, gift card, reservations, waitlist, expenses, cash close, P&L, staff, timesheets, activity log, CSV and backup downloads |
| Cleanup | No orders, customers, feedback, bills, bookings, expenses or test records left; stock at the demo starting levels; coupons unused |
| Browser on your project | Floor (8 free tables), Inventory, Customers and the restaurant page load with your data |
| Writes (orders, bills, refunds, stock, purchase orders) | Tested end to end on the staging copy (87 / 87) with byte-identical database functions; not repeated here so your data stays clean |
