// Restaurant OS — connection + setup check for the Supabase project in apps/api/.env
// Usage (from the repo root):  node scripts/check-supabase.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY;
const EMAIL = env.DEMO_ADMIN_EMAIL ?? 'demo@restaurantos.app';
const PASS = env.DEMO_ADMIN_PASSWORD ?? 'demo1234';
const h = { apikey: KEY, 'Content-Type': 'application/json' };
let fail = 0;
const ok = (c, m, x) => (c ? console.log('PASS', m) : (fail++, console.log('FAIL', m, x ?? '')));

async function main() {
  console.log(`Project: ${URL_}\n`);
  const health = await fetch(`${URL_}/auth/v1/health`, { headers: h });
  ok(health.ok, 'Project reachable and key accepted (auth health)', health.status);

  const r = await fetch(`${URL_}/rest/v1/restaurants?select=name,plan&slug=eq.saffron-lane`, { headers: h });
  const rest = await r.json();
  if (r.status === 404) {
    console.log('\nThe database is empty: no Restaurant OS tables, functions or demo login were found.');
    console.log("Run supabase/setup_full.sql in this project's SQL editor, then run this check again.");
    return 1;
  }
  ok(r.ok && rest[0]?.name, 'Schema installed, demo restaurant found', rest);
  ok(['starter', 'growth', 'premium'].includes(rest[0]?.plan), `Plans migration (0003) installed (plan: ${rest[0]?.plan})`, rest[0]?.plan);

  const hi = await fetch(`${URL_}/rest/v1/menu_items?select=id&name_hi=not.is.null`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } });
  const hiCount = Number((hi.headers.get('content-range') ?? '/0').split('/')[1]);
  ok(hi.ok, `Hindi menu migration (0005) installed (${hiCount} dishes in Hindi)`, hi.status);

  const loyalty = await fetch(`${URL_}/rest/v1/rpc/get_loyalty_status`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ p_table_code: 'DEMO1', p_guest_session_id: crypto.randomUUID() }),
  });
  ok(loyalty.ok, 'Loyalty functions installed (0005)', loyalty.status);

  const addRef = await fetch(`${URL_}/rest/v1/rpc/add_order_items`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ p_order_id: crypto.randomUUID(), p_guest_session_id: crypto.randomUUID(), p_items: [], p_client_ref: crypto.randomUUID() }),
  });
  ok(addRef.status !== 404, 'Add-to-order duplicate protection installed (0004)', addRef.status);

  const ops = await fetch(`${URL_}/rest/v1/restaurants?select=takeaway_enabled,reservations_enabled&slug=eq.saffron-lane`, { headers: h });
  const opsRow = ops.ok ? (await ops.json())[0] : null;
  ok(ops.ok && opsRow && 'takeaway_enabled' in opsRow, 'POS, inventory & finance migration (0006) installed', ops.status === 400 ? 'run 0006_pos_inventory_finance_staff.sql' : ops.status);
  if (ops.ok) {
    const quote = await fetch(`${URL_}/rest/v1/rpc/quote_order`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ p_table_code: 'DEMO1', p_restaurant_slug: null, p_items: [], p_coupon_code: null }),
    });
    ok(quote.ok, 'Price preview function callable (quote_order)', quote.status);
    const bills = await fetch(`${URL_}/rest/v1/bills?select=id`, { headers: h });
    ok(bills.ok && (await bills.json()).length === 0, 'Row-level security hides bills from the public key');
  }

  const saas = await fetch(`${URL_}/rest/v1/rpc/slug_available`, { method: 'POST', headers: h, body: JSON.stringify({ p_slug: 'saffron-lane' }) });
  ok(saas.ok, 'Self-signup, platform console & notifications migration (0007) installed', saas.status === 404 ? 'run 0007_saas_platform_notifications.sql' : saas.status);
  if (saas.ok) {
    const subs = await fetch(`${URL_}/rest/v1/push_subscriptions?select=id`, { headers: h });
    ok(subs.ok && (await subs.json()).length === 0, 'Row-level security hides notification subscriptions from the public key');
  }

  const items = await fetch(`${URL_}/rest/v1/menu_items?select=id`, { headers: { ...h, Prefer: 'count=exact', Range: '0-0' } });
  const count = Number((items.headers.get('content-range') ?? '/0').split('/')[1]);
  // Restaurants edit their menus and new ones get sample menus, so only "has dishes" is checked.
  ok(count > 0, `Menu loaded (${count} dishes across all restaurants)`);

  const orders = await fetch(`${URL_}/rest/v1/orders?select=id`, { headers: h });
  ok(orders.ok && (await orders.json()).length === 0, 'Row-level security hides orders from the public key');

  const calls = await fetch(`${URL_}/rest/v1/rpc/get_session_calls`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ p_table_code: 'DEMO1', p_guest_session_id: crypto.randomUUID() }),
  });
  ok(calls.ok, 'Guest functions callable (get_session_calls)', calls.status);

  const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: h, body: JSON.stringify({ email: EMAIL, password: PASS }) });
  const session = await login.json();
  ok(login.ok && session.access_token, 'Demo staff login works', session.error_description ?? session.msg);
  if (session.access_token) {
    const staff = await fetch(`${URL_}/rest/v1/staff?select=role`, { headers: { ...h, Authorization: `Bearer ${session.access_token}` } });
    ok((await staff.json())[0]?.role === 'owner', 'Staff linked to the restaurant (RLS)');
  }
  console.log(fail ? `\n${fail} check(s) failed.` : '\nAll checks passed. The app is connected to this project.');
  return fail ? 1 : 0;
}

process.exitCode = await main();
