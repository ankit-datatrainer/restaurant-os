import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { IntegrationEventRow, WhatsAppMessageRow } from '@restaurant-os/shared';
import { formatIndianPhone, normalizeIndianPhone } from '@restaurant-os/shared';
import { badRequest, forbidden, fromSupabase } from '../../lib/errors.js';
import type { StaffRequest } from '../../middleware/auth.js';
import { parse, staffHandler } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';
import { integrationSettingsSchema, whatsappBroadcastSchema, whatsappTestSchema } from '../../services/schemas.js';
import {
  loadIntegration,
  paramsFor,
  runAutomation,
  templateFor,
  toPublicSettings,
  unsubscribeLink,
  whatsappReady,
  type IntegrationRow,
} from '../../services/automation.js';
import { postWebhook } from '../../services/webhooks.js';
import { sendTemplate } from '../../services/whatsapp.js';

export const integrationsRouter = Router();

function requireManager(req: StaffRequest) {
  if (!['owner', 'manager'].includes(req.auth.staff.role)) throw forbidden('Only owners and managers can manage integrations.');
}

function requireAnyIntegration(req: StaffRequest) {
  // Both integrations are Premium; check one feature for the shared settings screen.
  requireFeature(req.auth.restaurant.plan, 'pos_integration');
}

// GET /api/admin/integrations
integrationsRouter.get(
  '/integrations',
  staffHandler(async (req, res) => {
    requireAnyIntegration(req);
    requireManager(req);
    let row = await loadIntegration(req.auth.db, req.auth.restaurant.id);
    if (!row) {
      // First visit: create the row so a signing secret exists to copy into the POS / middleware.
      const { data, error } = await req.auth.db.from('restaurant_integrations').insert({ restaurant_id: req.auth.restaurant.id }).select('*').single();
      if (error) throw fromSupabase(error);
      row = data as IntegrationRow;
    }
    res.json(toPublicSettings(row));
  }),
);

// PUT /api/admin/integrations
integrationsRouter.put(
  '/integrations',
  staffHandler(async (req, res) => {
    requireAnyIntegration(req);
    requireManager(req);
    const input = parse(integrationSettingsSchema, req.body);
    const rid = req.auth.restaurant.id;
    const existing = await loadIntegration(req.auth.db, rid);
    const patch: Record<string, unknown> = { ...input, restaurant_id: rid, updated_at: new Date().toISOString() };
    if ('wa_access_token' in input) patch.wa_access_token = input.wa_access_token ? input.wa_access_token : null;
    const next = { ...(existing ?? {}), ...patch } as Partial<IntegrationRow>;
    if (next.webhook_enabled && !next.webhook_url) throw badRequest('webhook_url: Add the URL before switching the webhook on.');
    if (next.wa_enabled && (!next.wa_phone_number_id || !next.wa_access_token)) {
      throw badRequest('wa_phone_number_id: Add the phone number ID and access token before switching WhatsApp on.');
    }
    const { data, error } = existing
      ? await req.auth.db.from('restaurant_integrations').update(patch).eq('restaurant_id', rid).select('*').single()
      : await req.auth.db.from('restaurant_integrations').insert(patch).select('*').single();
    if (error) throw fromSupabase(error);
    res.json(toPublicSettings(data as IntegrationRow));
  }),
);

// POST /api/admin/integrations/webhook/rotate-secret
integrationsRouter.post(
  '/integrations/webhook/rotate-secret',
  staffHandler(async (req, res) => {
    requireAnyIntegration(req);
    requireManager(req);
    const rid = req.auth.restaurant.id;
    const secret = randomBytes(24).toString('hex');
    const existing = await loadIntegration(req.auth.db, rid);
    const { data, error } = existing
      ? await req.auth.db.from('restaurant_integrations').update({ webhook_secret: secret, updated_at: new Date().toISOString() }).eq('restaurant_id', rid).select('*').single()
      : await req.auth.db.from('restaurant_integrations').insert({ restaurant_id: rid, webhook_secret: secret }).select('*').single();
    if (error) throw fromSupabase(error);
    res.json(toPublicSettings(data as IntegrationRow));
  }),
);

// POST /api/admin/integrations/webhook/test → signed "ping" to the saved URL
integrationsRouter.post(
  '/integrations/webhook/test',
  staffHandler(async (req, res) => {
    requireAnyIntegration(req);
    requireManager(req);
    const row = await loadIntegration(req.auth.db, req.auth.restaurant.id);
    if (!row?.webhook_url) throw badRequest('Save a webhook URL first.');
    const id = `ping-${Date.now()}`;
    const payload = {
      id,
      event: 'ping',
      created_at: new Date().toISOString(),
      restaurant: { id: req.auth.restaurant.id, name: req.auth.restaurant.name },
      order: null,
    };
    const r = await postWebhook(row.webhook_url, row.webhook_secret, id, 'ping', payload);
    res.json({ ok: r.ok, status: r.status, error: r.error });
  }),
);

// GET /api/admin/integrations/events → latest 50 deliveries
integrationsRouter.get(
  '/integrations/events',
  staffHandler(async (req, res) => {
    requireAnyIntegration(req);
    const { data, error } = await req.auth.db
      .from('integration_events')
      .select('id, event, order_id, created_at, delivered_at, attempts, next_attempt_at, last_status, last_error')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('id', { ascending: false })
      .limit(50);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as IntegrationEventRow[]);
  }),
);

// POST /api/admin/automation/run → webhooks + WhatsApp journeys now (called by the open dashboard)
integrationsRouter.post(
  '/automation/run',
  staffHandler(async (req, res) => {
    const r = req.auth.restaurant;
    if (!['owner', 'manager'].includes(req.auth.staff.role)) {
      res.json({
        ran_at: new Date().toISOString(),
        webhooks: { delivered: 0, failed: 0, pending: 0, skipped_reason: 'Runs from an owner or manager login.' },
        whatsapp: { sent: 0, failed: 0, due: 0, skipped_reason: 'Runs from an owner or manager login.' },
      });
      return;
    }
    res.json(await runAutomation(req.auth.db, { id: r.id, name: r.name, plan: r.plan }));
  }),
);

// GET /api/admin/whatsapp/messages → latest 100
integrationsRouter.get(
  '/whatsapp/messages',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'whatsapp_automation');
    const { data, error } = await req.auth.db
      .from('whatsapp_messages')
      .select('id, customer_id, phone, kind, template, status, wamid, error, created_at')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as WhatsAppMessageRow[]);
  }),
);

// POST /api/admin/whatsapp/test { to, kind? } → send one journey template to your own number
integrationsRouter.post(
  '/whatsapp/test',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'whatsapp_automation');
    requireManager(req);
    const input = parse(whatsappTestSchema, req.body);
    const row = await loadIntegration(req.auth.db, req.auth.restaurant.id);
    const notReady = row && row.wa_phone_number_id && row.wa_access_token ? null : whatsappReady(row);
    if (notReady || !row) throw badRequest(notReady ?? 'WhatsApp is not set up yet.');
    const kind = input.kind ?? 'welcome';
    const template = templateFor(row, kind);
    if (!template) throw badRequest(`Add the ${kind} template name first.`);
    const to = normalizeIndianPhone(input.to)!;
    const params = paramsFor(kind, {
      name: req.auth.staff.display_name,
      restaurant: req.auth.restaurant.name,
      unsubscribe: `${unsubscribeLink('00000000-0000-4000-8000-000000000000')}`,
      rewardText: 'A free dessert of your choice',
      rewardCode: 'TEST01',
      offer: 'This is a test message from Restaurant OS.',
    });
    const r = await sendTemplate({ phoneNumberId: row.wa_phone_number_id!, accessToken: row.wa_access_token!, to, template, language: row.wa_language, params });
    await req.auth.db.from('whatsapp_messages').insert({
      restaurant_id: req.auth.restaurant.id,
      phone: to,
      kind: 'test',
      template,
      status: r.ok ? 'sent' : 'failed',
      wamid: r.wamid,
      error: r.error,
    });
    res.json({ ok: r.ok, wamid: r.wamid, error: r.error, to: formatIndianPhone(to) });
  }),
);

// POST /api/admin/whatsapp/broadcast { segment?, message } → offer template to OPTED-IN customers only
integrationsRouter.post(
  '/whatsapp/broadcast',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'whatsapp_automation');
    requireManager(req);
    const input = parse(whatsappBroadcastSchema, req.body);
    const row = await loadIntegration(req.auth.db, req.auth.restaurant.id);
    const notReady = whatsappReady(row);
    if (notReady || !row) throw badRequest(notReady ?? 'WhatsApp is not set up yet.');
    if (!row.wa_template_offer) throw badRequest('Add the offer template name first.');

    const { data, error } = await req.auth.db.rpc('customer_list', { p_restaurant_id: req.auth.restaurant.id });
    if (error) throw fromSupabase(error);
    type C = { id: string; phone: string; name: string | null; marketing_consent: boolean; unsubscribe_token: string; visits: number; last_order_at: string | null; last_seen_at: string; first_seen_at: string };
    const now = Date.now();
    const segment = input.segment ?? 'opted_in';
    const audience = ((data ?? []) as C[]).filter((c) => {
      if (!c.marketing_consent) return false; // never message anyone who did not opt in
      const last = new Date(c.last_order_at ?? c.last_seen_at).getTime();
      if (segment === 'repeat') return Number(c.visits) >= 2;
      if (segment === 'lapsed') return now - last > 30 * 86_400_000;
      if (segment === 'new') return now - new Date(c.first_seen_at).getTime() <= 7 * 86_400_000;
      return true;
    });
    if (audience.length > 200) throw badRequest(`That is ${audience.length} customers. Send to at most 200 at a time (pick a smaller segment).`);

    const stamp = new Date().toISOString().slice(0, 16);
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const c of audience) {
      const r = await sendTemplate({
        phoneNumberId: row.wa_phone_number_id!,
        accessToken: row.wa_access_token!,
        to: c.phone,
        template: row.wa_template_offer,
        language: row.wa_language,
        params: paramsFor('offer', { name: c.name, restaurant: req.auth.restaurant.name, unsubscribe: unsubscribeLink(c.unsubscribe_token), offer: input.message }),
      });
      await req.auth.db.from('whatsapp_messages').insert({
        restaurant_id: req.auth.restaurant.id,
        customer_id: c.id,
        phone: c.phone,
        kind: 'offer',
        template: row.wa_template_offer,
        status: r.ok ? 'sent' : 'failed',
        wamid: r.wamid,
        error: r.error,
        dedupe_key: `offer:${c.id}:${stamp}`,
      });
      if (r.ok) sent++;
      else {
        failed++;
        if (r.error && errors.length < 3) errors.push(r.error);
      }
    }
    res.json({ audience: audience.length, sent, failed, errors });
  }),
);
