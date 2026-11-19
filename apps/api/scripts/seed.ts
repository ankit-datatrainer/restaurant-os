/**
 * Seeds a fresh Supabase project with the demo restaurant, tables, menu and the demo login.
 *
 *   npm run seed            (from the repo root; needs SUPABASE_SERVICE_ROLE_KEY in apps/api/.env)
 *
 * Without the service role key, run supabase/seed.sql in the Supabase SQL editor instead
 * (it contains the same data plus the demo auth user).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DEMO_ADMIN_EMAIL ?? 'demo@restaurantos.app';
const password = process.env.DEMO_ADMIN_PASSWORD ?? 'demo1234';

if (!url || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the seed script.');
  console.error('Alternative: paste supabase/seed.sql into the Supabase SQL editor.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // 1. Demo login
  let userId: string | null = null;
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    userId = existing.id;
    console.log(`Demo user already exists (${email})`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Demo Manager' },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created demo user ${email}`);
  }

  // 2. Data (idempotent SQL in supabase/seed.sql, minus the auth part)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.resolve(here, '../../../supabase/seed.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const dataOnly = sql.split('-- >>> AUTH USER (SQL editor only)')[0] ?? sql;

  // The JS client cannot run arbitrary SQL; use the SQL RPC helper if present, else instruct.
  const { error } = await supabase.rpc('exec_seed_sql', { p_sql: dataOnly });
  if (error) {
    console.warn('\nCould not run seed.sql through the API (no exec_seed_sql helper).');
    console.warn('Paste supabase/seed.sql into the Supabase SQL editor to load the demo data.');
  } else {
    console.log('Seed data loaded.');
  }

  // 3. Link the user to the demo restaurant
  const { data: rest } = await supabase.from('restaurants').select('id').eq('slug', 'saffron-lane').maybeSingle();
  if (rest && userId) {
    const { error: staffErr } = await supabase
      .from('staff')
      .upsert({ user_id: userId, restaurant_id: rest.id, role: 'owner', display_name: 'Demo Manager' }, { onConflict: 'user_id' });
    if (staffErr) throw staffErr;
    console.log('Demo user linked to Saffron Lane Café as owner.');
  }
  console.log('\nDone. Sign in at /admin/login with the DEMO_ADMIN_* values from apps/api/.env');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
