import type { PlanId } from '@restaurant-os/shared';
import { createApp } from './app.js';
import { config } from './config.js';
import { serviceClient } from './lib/supabase.js';
import { runAutomation } from './services/automation.js';

const app = createApp();

const onListening = () => {
  console.log(`\n  Restaurant OS API  →  http://localhost:${config.port}`);
  console.log(`  Supabase           →  ${config.supabaseUrl}`);
  console.log(`  Service role       →  ${config.supabaseServiceRoleKey ? 'configured (automation timer on)' : 'not set (RLS mode; automation runs from the open dashboard)'}\n`);
};

if (config.host) app.listen(config.port, config.host, onListening);
else app.listen(config.port, onListening);

/**
 * Server-side automation timer (webhook delivery + WhatsApp journeys) for every Premium restaurant.
 * Needs SUPABASE_SERVICE_ROLE_KEY; without it the open dashboard triggers the same run.
 */
if (serviceClient) {
  const db = serviceClient;
  const tick = async () => {
    try {
      const { data } = await db.from('restaurants').select('id, name, plan').eq('plan', 'premium');
      for (const r of (data ?? []) as Array<{ id: string; name: string; plan: PlanId }>) {
        await runAutomation(db, r).catch((e) => console.error(`[automation] ${r.name}:`, e instanceof Error ? e.message : e));
      }
    } catch (e) {
      console.error('[automation] tick failed:', e instanceof Error ? e.message : e);
    }
  };
  setInterval(tick, 2 * 60_000).unref();
  setTimeout(tick, 15_000).unref();
}
