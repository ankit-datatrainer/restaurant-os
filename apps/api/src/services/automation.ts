/**
 * One automation pass for a restaurant: deliver pending order webhooks, then send due WhatsApp
 * journeys (welcome / win-back / reward). Triggered by the open dashboard (every couple of minutes
 * and right after order events) and, when SUPABASE_SERVICE_ROLE_KEY is set, by a server timer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AutomationRunResult, IntegrationSettings, PlanId, WhatsAppKind } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { config } from '../config.js';
import { deliverPending } from './webhooks.js';
import { sendTemplate } from './whatsapp.js';

export interface IntegrationRow {
  restaurant_id: string;
  webhook_enabled: boolean;
  webhook_url: string | null;
  webhook_secret: string;
  wa_enabled: boolean;
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  wa_language: string;
  wa_template_welcome: string | null;
  wa_template_winback: string | null;
  wa_template_reward: string | null;
  wa_template_offer: string | null;
  winback_days: number;
  updated_at: string;
}

export function unsubscribeLink(token: string): string {
  return `${config.appUrl}/unsubscribe/${token}`;
}

export function toPublicSettings(row: IntegrationRow | null): IntegrationSettings {
  const token = row?.wa_access_token ?? null;
  return {
    webhook_enabled: row?.webhook_enabled ?? false,
    webhook_url: row?.webhook_url ?? null,
    webhook_secret: row?.webhook_secret ?? '',
    wa_enabled: row?.wa_enabled ?? false,
    wa_phone_number_id: row?.wa_phone_number_id ?? null,
    wa_token_set: Boolean(token),
    wa_token_hint: token ? token.slice(-4) : null,
    wa_language: row?.wa_language ?? 'en',
    wa_template_welcome: row?.wa_template_welcome ?? null,
    wa_template_winback: row?.wa_template_winback ?? null,
    wa_template_reward: row?.wa_template_reward ?? null,
    wa_template_offer: row?.wa_template_offer ?? null,
    winback_days: row?.winback_days ?? 30,
    updated_at: row?.updated_at ?? null,
  };
}

export function templateFor(row: IntegrationRow, kind: Exclude<WhatsAppKind, 'test'>): string | null {
  return { welcome: row.wa_template_welcome, winback: row.wa_template_winback, reward: row.wa_template_reward, offer: row.wa_template_offer }[kind];
}

/** Body variables for each journey (order documented in services/whatsapp.ts). */
export function paramsFor(
  kind: Exclude<WhatsAppKind, 'test'>,
  ctx: { name: string | null; restaurant: string; unsubscribe: string; rewardText?: string | null; rewardCode?: string | null; offer?: string },
): string[] {
  const who = ctx.name?.trim() || 'there';
  switch (kind) {
    case 'welcome':
    case 'winback':
      return [who, ctx.restaurant, ctx.unsubscribe];
    case 'reward':
      return [who, ctx.rewardText ?? 'your reward', ctx.rewardCode ?? '', ctx.unsubscribe];
    case 'offer':
      return [who, ctx.offer ?? '', ctx.unsubscribe];
  }
}

export function whatsappReady(row: IntegrationRow | null): string | null {
  if (!row) return 'WhatsApp is not set up yet.';
  if (!row.wa_enabled) return 'WhatsApp automation is switched off.';
  if (!row.wa_phone_number_id || !row.wa_access_token) return 'Add your WhatsApp phone number ID and access token.';
  return null;
}

export async function loadIntegration(db: SupabaseClient, restaurantId: string): Promise<IntegrationRow | null> {
  const { data, error } = await db.from('restaurant_integrations').select('*').eq('restaurant_id', restaurantId).maybeSingle();
  if (error) throw error;
  return (data as IntegrationRow | null) ?? null;
}

interface DueRow {
  customer_id: string;
  phone: string;
  name: string | null;
  unsubscribe_token: string;
  kind: 'welcome' | 'winback' | 'reward';
  dedupe_key: string;
  reward_code: string | null;
  reward_text: string | null;
}

export async function runAutomation(
  db: SupabaseClient,
  restaurant: { id: string; name: string; plan: PlanId },
  opts: { maxMessages?: number } = {},
): Promise<AutomationRunResult> {
  const result: AutomationRunResult = {
    ran_at: new Date().toISOString(),
    webhooks: { delivered: 0, failed: 0, pending: 0, skipped_reason: null },
    whatsapp: { sent: 0, failed: 0, due: 0, skipped_reason: null },
  };
  const row = await loadIntegration(db, restaurant.id);

  // 1. Webhooks
  if (!planHas(restaurant.plan, 'pos_integration')) result.webhooks.skipped_reason = 'Webhooks are part of the Premium plan.';
  else if (!row?.webhook_enabled || !row.webhook_url) result.webhooks.skipped_reason = 'Webhook is switched off.';
  else {
    const w = await deliverPending(db, restaurant, row);
    result.webhooks = { ...w, skipped_reason: null };
  }

  // 2. WhatsApp journeys
  const notReady = !planHas(restaurant.plan, 'whatsapp_automation') ? 'Automated WhatsApp is part of the Premium plan.' : whatsappReady(row);
  if (notReady || !row) {
    result.whatsapp.skipped_reason = notReady;
    return result;
  }
  const { data, error } = await db.rpc('due_whatsapp_journeys', { p_restaurant_id: restaurant.id });
  if (error) throw error;
  const due = (data ?? []) as DueRow[];
  if (due.length === 0) return result;

  // Skip anything already sent (or failed today) — the unique dedupe_key is the source of truth.
  const keys = due.map((d) => d.dedupe_key);
  const today = new Date().toISOString().slice(0, 10);
  const { data: done } = await db
    .from('whatsapp_messages')
    .select('dedupe_key')
    .eq('restaurant_id', restaurant.id)
    .in('dedupe_key', [...keys, ...keys.map((k) => `${k}:failed:${today}`)]);
  const seen = new Set(((done ?? []) as Array<{ dedupe_key: string }>).map((d) => d.dedupe_key.replace(/:failed:\d{4}-\d{2}-\d{2}$/, '')));
  const todo = due.filter((d) => !seen.has(d.dedupe_key));
  result.whatsapp.due = todo.length;

  for (const d of todo.slice(0, opts.maxMessages ?? 25)) {
    const template = templateFor(row, d.kind);
    if (!template) continue;
    const params = paramsFor(d.kind, {
      name: d.name,
      restaurant: restaurant.name,
      unsubscribe: unsubscribeLink(d.unsubscribe_token),
      rewardText: d.reward_text,
      rewardCode: d.reward_code,
    });
    const r = await sendTemplate({
      phoneNumberId: row.wa_phone_number_id!,
      accessToken: row.wa_access_token!,
      to: d.phone,
      template,
      language: row.wa_language,
      params,
    });
    await db.from('whatsapp_messages').insert({
      restaurant_id: restaurant.id,
      customer_id: d.customer_id,
      phone: d.phone,
      kind: d.kind,
      template,
      status: r.ok ? 'sent' : 'failed',
      wamid: r.wamid,
      error: r.error,
      // A failure is retried at most once a day; a success is never repeated.
      dedupe_key: r.ok ? d.dedupe_key : `${d.dedupe_key}:failed:${today}`,
    });
    if (r.ok) result.whatsapp.sent++;
    else result.whatsapp.failed++;
  }
  return result;
}
