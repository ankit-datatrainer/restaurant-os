'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  MessageCircle,
  Play,
  RefreshCw,
  Send,
  Webhook,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AutomationRunResult, IntegrationEventRow, IntegrationSettings, IntegrationSettingsInput, WhatsAppMessageRow } from '@restaurant-os/shared';
import { WEBHOOK_EVENTS, formatIndianPhone, normalizeIndianPhone, planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatDateTime, formatTime, timeAgo } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader, Input, Select, Skeleton, Toggle } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { useConfirm } from './confirm-dialog';
import { PageHeader } from './page-header';
import { errorMessage } from './format';
import { UpgradeCard, isManagerRole, isPlanError } from './plan';
import { automationSummary } from './use-automation';
import { useNow } from './use-now';
import { JOURNEYS, whatsappReady, type JourneyKind } from './whatsapp-templates';

/** Retry delays after a failed delivery, in minutes (apps/api/src/services/webhooks.ts BACKOFF_MIN). */
const RETRY_MINUTES = [1, 5, 30, 120, 360, 720];
/** First attempt + one per back-off step. */
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

const EVENT_DESCRIPTION: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  'order.placed': 'A guest placed a new order',
  'order.items_added': 'The guest added dishes to an open order',
  'order.status_changed': 'Accepted, preparing, ready or served',
  'order.cancelled': 'The order was cancelled',
  'order.payment_changed': 'Payment marked paid, “guest says paid” or refunded',
  ping: 'Sent by “Send test” (order is null)',
};

const VERIFY_SNIPPET = `const crypto = require('crypto');
function verify(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signatureHeader || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const BODY_SAMPLE = `{
  "id": "1234",
  "event": "order.placed",
  "created_at": "2026-10-26T13:05:12.000Z",
  "restaurant": { "id": "…", "name": "Your restaurant" },
  "order": { "id": "…", "order_number": 1042, "status": "placed",
             "total": 869, "items": [ … ], "table": { … } }
}`;

const INTEGRATION_POINTS = [
  'Send every order to your POS, KOT printer software or Zapier/Make',
  'Signed webhooks with automatic retries',
  'Automated WhatsApp welcome, win-back and reward messages',
  'One-tap WhatsApp offer broadcasts to opted-in guests',
];

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error('Copy is blocked in this browser. Select the text and press Ctrl+C.');
  }
}

export function IntegrationsView() {
  const { restaurant, staff } = useAdmin();
  if (!planHas(restaurant.plan, 'pos_integration') && !planHas(restaurant.plan, 'whatsapp_automation')) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <PageHeader title="Integrations" description="Connect Restaurant OS to your POS and to WhatsApp." />
        <UpgradeCard
          plan="premium"
          title="Plug your orders into everything else"
          description="POS/webhook integration and automated WhatsApp messages are part of the Premium plan."
          points={INTEGRATION_POINTS}
        />
      </div>
    );
  }
  if (!isManagerRole(staff.role)) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <PageHeader title="Integrations" />
        <Card>
          <CardBody className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
            <p className="text-[15px]">Only owners and managers can see and change integrations, because they hold your POS secret and WhatsApp access token.</p>
          </CardBody>
        </Card>
      </div>
    );
  }
  return <IntegrationsInner />;
}

function IntegrationsInner() {
  const { token, automation } = useAdmin();
  const now = useNow(30_000);
  const [settings, setSettings] = React.useState<IntegrationSettings | null>(null);
  const [events, setEvents] = React.useState<IntegrationEventRow[] | null>(null);
  const [messages, setMessages] = React.useState<WhatsAppMessageRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);

  const handle = React.useCallback((e: unknown, fallback: string) => {
    if (isPlanError(e)) setLocked(e.message);
    else setError(errorMessage(e, fallback));
  }, []);

  const loadSettings = React.useCallback(async () => {
    try {
      setSettings(await adminApi.integrations(token));
      setError(null);
    } catch (e) {
      handle(e, 'Could not load the integration settings.');
    }
  }, [token, handle]);

  const loadEvents = React.useCallback(async () => {
    try {
      setEvents(await adminApi.webhookEvents(token));
    } catch (e) {
      handle(e, 'Could not load the webhook delivery log.');
      setEvents((prev) => prev ?? []);
    }
  }, [token, handle]);

  const loadMessages = React.useCallback(async () => {
    try {
      setMessages(await adminApi.whatsappMessages(token));
    } catch (e) {
      handle(e, 'Could not load the WhatsApp message log.');
      setMessages((prev) => prev ?? []);
    }
  }, [token, handle]);

  React.useEffect(() => {
    void loadSettings();
    void loadEvents();
    void loadMessages();
  }, [loadSettings, loadEvents, loadMessages]);

  // Logs follow the automatic runs.
  const lastRun = automation.last?.ran_at;
  React.useEffect(() => {
    if (!lastRun) return;
    void loadEvents();
    void loadMessages();
  }, [lastRun, loadEvents, loadMessages]);

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1200px]">
        <PageHeader title="Integrations" />
        <UpgradeCard
          plan="premium"
          title="Plug your orders into everything else"
          description="POS/webhook integration and automated WhatsApp messages are part of the Premium plan."
          message={locked}
          points={INTEGRATION_POINTS}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader title="Integrations" description="Send orders to your other systems and message guests on WhatsApp automatically." />

      <div className="mb-4 flex flex-col gap-1 rounded-2xl border border-line/10 bg-surface px-4 py-3 text-sm shadow-soft sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex items-center gap-2 font-medium">
          <Zap className="h-4 w-4 text-ember" aria-hidden /> Automation
        </span>
        <span className="text-muted">
          {automation.last ? (
            <>
              Last automatic run: <span className="text-fg">{timeAgo(automation.last.ran_at, now)}</span> · {automationSummary(automation.last)}
            </>
          ) : (
            'Runs from this dashboard every 2 minutes while it is open, and right after order changes.'
          )}
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      {!settings ? (
        <div className="grid gap-4">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-6">
          <WebhookCard settings={settings} onSettings={setSettings} events={events} reloadEvents={loadEvents} />
          <WhatsAppCard
            settings={settings}
            onSettings={setSettings}
            messages={messages}
            reloadMessages={loadMessages}
            afterRun={() => {
              void loadEvents();
              void loadMessages();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A) POS & webhooks
// ---------------------------------------------------------------------------

function WebhookCard({
  settings,
  onSettings,
  events,
  reloadEvents,
}: {
  settings: IntegrationSettings;
  onSettings: (s: IntegrationSettings) => void;
  events: IntegrationEventRow[] | null;
  reloadEvents: () => Promise<void>;
}) {
  const { token } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [enabled, setEnabled] = React.useState(settings.webhook_enabled);
  const [url, setUrl] = React.useState(settings.webhook_url ?? '');
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<{ ok: boolean; status: number | null; error: string | null } | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const dirty = enabled !== settings.webhook_enabled || url.trim() !== (settings.webhook_url ?? '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (u && !/^https?:\/\/\S+$/i.test(u)) {
      setUrlError('Use a full address starting with https:// (or http://).');
      return;
    }
    if (enabled && !u) {
      setUrlError('Add the URL that should receive your orders before switching webhooks on.');
      return;
    }
    setUrlError(null);
    setSaving(true);
    try {
      const saved = await adminApi.saveIntegrations(token, { webhook_enabled: enabled, webhook_url: u || null });
      onSettings(saved);
      setEnabled(saved.webhook_enabled);
      setUrl(saved.webhook_url ?? '');
      toast.success(saved.webhook_enabled ? 'Webhooks are on. New order events will be sent.' : 'Webhook settings saved.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the webhook settings.'));
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: 'Generate a new signing secret?',
      description: 'The old secret stops working immediately. Paste the new one into your POS, middleware or server, or it will reject every delivery as unsigned.',
      confirmLabel: 'Generate new secret',
      danger: true,
    });
    if (!ok) return;
    setRotating(true);
    try {
      const saved = await adminApi.rotateWebhookSecret(token);
      onSettings(saved);
      setReveal(true);
      toast.success('New secret generated. Copy it into your receiver now.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate a new secret.'));
    } finally {
      setRotating(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await adminApi.testWebhook(token);
      setTest(res);
      void reloadEvents();
    } catch (err) {
      setTest({ ok: false, status: null, error: errorMessage(err, 'The test could not be sent.') });
    } finally {
      setTesting(false);
    }
  };

  const secret = settings.webhook_secret ?? '';
  const masked = secret ? `${'•'.repeat(Math.max(8, Math.min(28, secret.length - 4)))}${secret.slice(-4)}` : '—';

  return (
    <Card as="section" aria-labelledby="webhook-title">
      <CardHeader
        title={
          <span id="webhook-title" className="inline-flex items-center gap-2">
            <Webhook className="h-5 w-5 text-ember" aria-hidden /> POS &amp; webhooks
          </span>
        }
        description="Send every order to your POS, KOT printer software, Zapier/Make or your own server the moment it happens."
        action={<Badge tone={settings.webhook_enabled && settings.webhook_url ? 'mint' : 'neutral'} dot>{settings.webhook_enabled && settings.webhook_url ? 'On' : 'Off'}</Badge>}
      />
      <CardBody className="space-y-6 pt-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky/25 bg-sky-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#245a9f]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Each order event is sent to your URL as a signed JSON request, and retried automatically if your system is down. Native Petpooja / other POS connectors need that vendor&apos;s partner
            API — use their webhook/import endpoint or a middleware.
          </p>
        </div>

        <form onSubmit={save} className="grid gap-4" noValidate>
          <Toggle checked={enabled} onChange={setEnabled} label="Send order webhooks" description={enabled ? 'Events are queued and delivered as orders change' : 'Nothing is sent'} />
          <Input
            label="Webhook URL"
            type="url"
            inputMode="url"
            placeholder="https://your-pos.example.com/restaurant-os/orders"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={urlError ?? undefined}
            hint="Receives a POST for every order event."
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-xs text-muted">Unsaved changes</span>}
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save webhook settings
            </Button>
          </div>
        </form>

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-fg/80">Signing secret</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="tnum min-w-0 flex-1 truncate rounded-xl border border-line/15 bg-sunk px-3.5 py-2.5 font-mono text-sm" aria-label={reveal ? 'Signing secret' : 'Signing secret, hidden'}>
              {reveal ? secret : masked}
            </code>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" leftIcon={reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onClick={() => setReveal((v) => !v)} disabled={!secret}>
                {reveal ? 'Hide' : 'Reveal'}
              </Button>
              <Button type="button" variant="outline" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copyText(secret, 'Signing secret')} disabled={!secret}>
                Copy
              </Button>
              <Button type="button" variant="ghost" size="sm" loading={rotating} leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => void rotate()}>
                Generate new secret
              </Button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted">Your receiver uses it to check that a request really came from Restaurant OS. Keep it private.</p>
        </div>

        <div className="rounded-2xl bg-sunk/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="dark" size="sm" loading={testing} leftIcon={<Send className="h-4 w-4" />} onClick={() => void sendTest()} disabled={dirty || !settings.webhook_url}>
              Send test
            </Button>
            <p className="text-xs text-muted">
              {dirty ? 'Save your changes first.' : !settings.webhook_url ? 'Add and save a URL first.' : 'Sends a “ping” event with order set to null.'}
            </p>
          </div>
          {test && (
            <p
              className={cn('mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm', test.ok ? 'bg-mint-soft text-[#1b6f49]' : 'bg-rose-soft text-[#a1282c]')}
              role="status"
            >
              {test.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 break-words">
                {test.ok ? `Delivered. Your server answered HTTP ${test.status ?? '2xx'}.` : `Not delivered${test.status ? ` (HTTP ${test.status})` : ''}: ${test.error ?? 'no response'}`}
              </span>
            </p>
          )}
        </div>

        <DeveloperDocs />

        <section aria-labelledby="deliveries-title">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 id="deliveries-title" className="eyebrow">
              Delivery log
            </h4>
            <Button
              variant="ghost"
              size="sm"
              loading={refreshing}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={async () => {
                setRefreshing(true);
                await reloadEvents();
                setRefreshing(false);
              }}
            >
              Refresh
            </Button>
          </div>
          <DeliveryLog events={events} />
        </section>
      </CardBody>
      {dialog}
    </Card>
  );
}

function DeveloperDocs() {
  return (
    <details className="group rounded-2xl border border-line/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        For developers: request format, signature and retries
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-5 border-t border-line/10 px-4 py-4 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Method</dt>
          <dd>
            <code className="font-mono">POST</code> to your URL, <code className="font-mono">Content-Type: application/json</code>
          </dd>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">X-RestaurantOS-Event</dt>
          <dd>The event name (list below)</dd>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">X-RestaurantOS-Delivery</dt>
          <dd>The event id. Retries reuse it, so you can ignore duplicates.</dd>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">X-RestaurantOS-Signature</dt>
          <dd>
            <code className="font-mono">sha256=&lt;hex&gt;</code>: HMAC-SHA256 of the raw request body with your signing secret
          </dd>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Success</dt>
          <dd>Answer with any 2xx status within 8 seconds.</dd>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Retries</dt>
          <dd>
            Anything else is retried after <span className="tnum font-mono">{RETRY_MINUTES.join(', ')}</span> minutes, then marked failed.
          </dd>
        </dl>

        <div>
          <p className="mb-1.5 font-semibold">Body</p>
          <p className="mb-2 text-muted">
            <code className="font-mono text-fg">{'{ id, event, created_at, restaurant: { id, name }, order }'}</code> — <code className="font-mono">order</code> is the full order with items and table
            (null for ping).
          </p>
          <pre className="no-scrollbar overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-xs leading-relaxed text-paper/90">{BODY_SAMPLE}</pre>
        </div>

        <div>
          <p className="mb-1.5 font-semibold">Events</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <li key={ev} className="rounded-lg bg-sunk px-3 py-2">
                <code className="font-mono text-xs font-semibold">{ev}</code>
                <span className="block text-xs text-muted">{EVENT_DESCRIPTION[ev]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-semibold">Verify the signature (Node.js)</p>
            <Button type="button" variant="ghost" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copyText(VERIFY_SNIPPET, 'Code')}>
              Copy
            </Button>
          </div>
          <pre className="no-scrollbar overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-xs leading-relaxed text-paper/90">{VERIFY_SNIPPET}</pre>
          <p className="mt-1.5 text-xs text-muted">Use the raw body bytes exactly as received, before any JSON parsing.</p>
        </div>
      </div>
    </details>
  );
}

function deliveryState(e: IntegrationEventRow): { tone: 'mint' | 'saffron' | 'rose' | 'neutral'; label: string; detail: string | null } {
  if (e.delivered_at) return { tone: 'mint', label: 'Delivered', detail: formatDateTime(e.delivered_at) };
  const error = e.last_error ?? (e.last_status ? `HTTP ${e.last_status}` : null);
  if (e.attempts >= MAX_ATTEMPTS) return { tone: 'rose', label: 'Failed', detail: error };
  if (e.attempts > 0) return { tone: 'saffron', label: `Retrying at ${formatTime(e.next_attempt_at)}`, detail: error };
  return { tone: 'neutral', label: 'Pending', detail: null };
}

function DeliveryLog({ events }: { events: IntegrationEventRow[] | null }) {
  if (events === null) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (events.length === 0) return <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-muted">No events yet. They appear here as orders come in while webhooks are on.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          <tr>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Event
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Order
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Created
            </th>
            <th scope="col" className="px-3.5 py-2.5 text-right font-medium">
              Attempts
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/5">
          {events.map((e) => {
            const st = deliveryState(e);
            return (
              <tr key={e.id} className="align-top">
                <td className="px-3.5 py-2.5">
                  <code className="font-mono text-xs">{e.event}</code>
                </td>
                <td className="px-3.5 py-2.5">
                  {e.order_id ? (
                    <Link href={`/admin/billing/${e.order_id}`} className="font-medium text-ember hover:underline">
                      Open order
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="tnum whitespace-nowrap px-3.5 py-2.5 font-mono text-xs">{formatDateTime(e.created_at)}</td>
                <td className="tnum px-3.5 py-2.5 text-right font-mono text-xs">{e.attempts}</td>
                <td className="px-3.5 py-2.5">
                  <Badge tone={st.tone} dot={st.tone === 'mint'}>
                    {st.label}
                  </Badge>
                  {st.detail && <p className={cn('mt-1 max-w-[280px] break-words text-xs', st.tone === 'mint' ? 'tnum font-mono text-muted' : 'text-[#a1282c]')}>{st.detail}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B) WhatsApp Cloud API
// ---------------------------------------------------------------------------

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English (en)' },
  { code: 'en_US', label: 'English US (en_US)' },
  { code: 'hi', label: 'Hindi (hi)' },
];

type TokenMode = 'keep' | 'replace' | 'remove';

interface WaDraft {
  enabled: boolean;
  phoneId: string;
  language: string;
  templates: Record<JourneyKind, string>;
  winbackDays: string;
  token: string;
  tokenMode: TokenMode;
}

function toWaDraft(s: IntegrationSettings): WaDraft {
  return {
    enabled: s.wa_enabled,
    phoneId: s.wa_phone_number_id ?? '',
    language: s.wa_language || 'en',
    templates: {
      welcome: s.wa_template_welcome ?? '',
      winback: s.wa_template_winback ?? '',
      reward: s.wa_template_reward ?? '',
      offer: s.wa_template_offer ?? '',
    },
    winbackDays: String(s.winback_days),
    token: '',
    tokenMode: s.wa_token_set ? 'keep' : 'replace',
  };
}

const SETUP_STEPS: Array<{ title: string; body: string; href?: string; linkLabel?: string }> = [
  {
    title: 'Open WhatsApp Manager',
    body: 'Sign in to Meta Business Suite with the account that owns your WhatsApp Business number.',
    href: 'https://business.facebook.com/',
    linkLabel: 'business.facebook.com → WhatsApp Manager',
  },
  {
    title: 'Set up the Cloud API',
    body: 'Follow Meta’s guide to add your phone number and create a permanent access token (a system user token).',
    href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    linkLabel: 'Cloud API get-started guide',
  },
  {
    title: 'Create the message templates',
    body: 'In WhatsApp Manager → Message templates, create the templates below with the variables in the order shown, and wait for Meta to approve them.',
    href: 'https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages',
    linkLabel: 'Template messages docs',
  },
  {
    title: 'Paste the IDs here',
    body: 'Phone number ID, access token and the exact template names. Save, then send yourself a test message.',
  },
];

function WhatsAppCard({
  settings,
  onSettings,
  messages,
  reloadMessages,
  afterRun,
}: {
  settings: IntegrationSettings;
  onSettings: (s: IntegrationSettings) => void;
  messages: WhatsAppMessageRow[] | null;
  reloadMessages: () => Promise<void>;
  afterRun: () => void;
}) {
  const { token, restaurant, automation } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = React.useState<WaDraft>(() => toWaDraft(settings));
  const [errors, setErrors] = React.useState<Partial<Record<'phoneId' | 'token' | 'winbackDays' | 'enabled' | JourneyKind, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [testTo, setTestTo] = React.useState('');
  const [testKind, setTestKind] = React.useState<JourneyKind>('welcome');
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; wamid: string | null; error: string | null; to: string } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runResult, setRunResult] = React.useState<AutomationRunResult | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const set = <K extends keyof WaDraft>(key: K, value: WaDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setTemplate = (kind: JourneyKind, value: string) => setDraft((d) => ({ ...d, templates: { ...d.templates, [kind]: value } }));

  const base = toWaDraft(settings);
  const dirty =
    draft.enabled !== base.enabled ||
    draft.phoneId.trim() !== base.phoneId ||
    draft.language !== base.language ||
    draft.winbackDays.trim() !== base.winbackDays ||
    JOURNEYS.some((j) => draft.templates[j.kind].trim() !== base.templates[j.kind]) ||
    draft.tokenMode === 'remove' ||
    draft.token.trim() !== '';

  const languages = LANGUAGES.some((l) => l.code === draft.language) ? LANGUAGES : [...LANGUAGES, { code: draft.language, label: draft.language }];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const phoneId = draft.phoneId.trim();
    if (phoneId && !/^\d{6,30}$/.test(phoneId)) next.phoneId = 'The phone number ID is the long number (digits only) from WhatsApp Manager → API setup.';
    const tokenInput = draft.token.trim();
    const willHaveToken = draft.tokenMode === 'remove' ? false : tokenInput !== '' || settings.wa_token_set;
    if (draft.tokenMode === 'replace' && settings.wa_token_set && !tokenInput) next.token = 'Paste the new token, or cancel to keep the saved one.';
    for (const j of JOURNEYS) {
      const v = draft.templates[j.kind].trim();
      if (v && !/^[a-z0-9_]{1,512}$/.test(v)) next[j.kind] = 'Lowercase letters, digits and underscores only, exactly as in WhatsApp Manager.';
    }
    const days = Number(draft.winbackDays);
    if (!Number.isInteger(days) || days < 7 || days > 365) next.winbackDays = 'A whole number from 7 to 365.';
    if (draft.enabled && (!phoneId || !willHaveToken)) next.enabled = 'Add the phone number ID and access token before switching WhatsApp on.';
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Fix the highlighted fields.');
      return;
    }
    const body: IntegrationSettingsInput = {
      wa_enabled: draft.enabled,
      wa_phone_number_id: phoneId || null,
      wa_language: draft.language,
      wa_template_welcome: draft.templates.welcome.trim() || null,
      wa_template_winback: draft.templates.winback.trim() || null,
      wa_template_reward: draft.templates.reward.trim() || null,
      wa_template_offer: draft.templates.offer.trim() || null,
      winback_days: days,
    };
    // The token is never sent back to us: only send it when typing a new one, "" to remove it.
    if (draft.tokenMode === 'remove') body.wa_access_token = '';
    else if (tokenInput) body.wa_access_token = tokenInput;
    setSaving(true);
    try {
      const saved = await adminApi.saveIntegrations(token, body);
      onSettings(saved);
      setDraft(toWaDraft(saved));
      toast.success(saved.wa_enabled ? 'WhatsApp settings saved. Journeys will send automatically.' : 'WhatsApp settings saved.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the WhatsApp settings.'));
    } finally {
      setSaving(false);
    }
  };

  const removeToken = async () => {
    const ok = await confirm({
      title: 'Remove the saved access token?',
      description: 'WhatsApp messages stop sending once you save. You can paste a token again any time.',
      confirmLabel: 'Remove token',
      danger: true,
    });
    if (ok) setDraft((d) => ({ ...d, tokenMode: 'remove', token: '', enabled: false }));
  };

  const sendTest = async () => {
    const to = normalizeIndianPhone(testTo);
    if (!to) {
      setTestResult({ ok: false, wamid: null, error: 'Enter a valid 10-digit Indian mobile number.', to: testTo });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.whatsappTest(token, { to, kind: testKind });
      setTestResult(res);
      void reloadMessages();
    } catch (err) {
      setTestResult({ ok: false, wamid: null, error: errorMessage(err, 'The test message could not be sent.'), to });
    } finally {
      setTesting(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await automation.runNow();
      setRunResult(res);
      afterRun();
    } catch (err) {
      setRunError(errorMessage(err, 'The run failed.'));
    } finally {
      setRunning(false);
    }
  };

  const ready = whatsappReady(settings);
  const testTemplate = settings[JOURNEYS.find((j) => j.kind === testKind)!.field];

  return (
    <Card as="section" aria-labelledby="wa-title">
      <CardHeader
        title={
          <span id="wa-title" className="inline-flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#1f9d55]" aria-hidden /> WhatsApp (Cloud API)
          </span>
        }
        description="Welcome, win-back and reward messages sent for you, only to guests who opted in."
        action={<Badge tone={ready ? 'mint' : 'neutral'} dot>{ready ? 'On' : 'Off'}</Badge>}
      />
      <CardBody className="space-y-6 pt-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky/25 bg-sky-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#245a9f]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Uses your own WhatsApp Business account through Meta&apos;s official Cloud API. Messages go only to guests who ticked the WhatsApp box. Meta charges per conversation; templates must be
            approved in WhatsApp Manager first.
          </p>
        </div>

        <section aria-labelledby="wa-setup">
          <h4 id="wa-setup" className="eyebrow mb-3">
            Setup, once
          </h4>
          <ol className="grid gap-2 md:grid-cols-2">
            {SETUP_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-2xl border border-line/10 p-3.5">
                <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-semibold text-paper" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{s.body}</p>
                  {s.href && (
                    <a href={s.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-ember hover:underline">
                      {s.linkLabel} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <form onSubmit={save} className="grid gap-5" noValidate id="wa-fields">
          <div>
            <Toggle
              checked={draft.enabled}
              onChange={(v) => set('enabled', v)}
              label="Send WhatsApp messages automatically"
              description={draft.enabled ? 'Journeys below send on their own' : 'Nothing is sent'}
            />
            {errors.enabled && <p className="mt-1.5 text-xs text-rose">{errors.enabled}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Phone number ID"
              inputMode="numeric"
              placeholder="109876543210987"
              value={draft.phoneId}
              onChange={(e) => set('phoneId', e.target.value)}
              error={errors.phoneId}
              hint="WhatsApp Manager → API setup. Not your phone number."
              className="tnum font-mono"
              autoComplete="off"
            />
            <div className="grid gap-1.5">
              {settings.wa_token_set && draft.tokenMode === 'keep' ? (
                <>
                  <p className="text-[13px] font-semibold text-fg/80">Access token</p>
                  <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-line/15 bg-sunk px-3.5 py-1.5">
                    <span className="inline-flex flex-1 items-center gap-1.5 text-sm">
                      <Check className="h-4 w-4 text-[#1b6f49]" aria-hidden />
                      Saved{settings.wa_token_hint ? <> · ends in <span className="tnum font-mono font-semibold">{settings.wa_token_hint}</span></> : null}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, tokenMode: 'replace', token: '' }))}>
                      Replace
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-rose hover:bg-rose-soft" onClick={() => void removeToken()}>
                      Remove
                    </Button>
                  </div>
                  <p className="text-xs text-muted">Kept on the server and never shown again, not even to you.</p>
                </>
              ) : draft.tokenMode === 'remove' ? (
                <>
                  <p className="text-[13px] font-semibold text-fg/80">Access token</p>
                  <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-rose/30 bg-rose-soft px-3.5 py-1.5 text-sm text-[#a1282c]">
                    <span className="flex-1">Will be removed when you save.</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, tokenMode: 'keep' }))}>
                      Undo
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Input
                    label="Access token"
                    type="password"
                    placeholder={settings.wa_token_set ? 'Paste the new token' : 'EAAG…'}
                    value={draft.token}
                    onChange={(e) => set('token', e.target.value)}
                    error={errors.token}
                    hint="A permanent system-user token with whatsapp_business_messaging permission."
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  {settings.wa_token_set && (
                    <button type="button" className="self-start text-xs font-semibold text-muted hover:text-fg" onClick={() => setDraft((d) => ({ ...d, tokenMode: 'keep', token: '' }))}>
                      Cancel, keep the saved token
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Template language" value={draft.language} onChange={(e) => set('language', e.target.value)} hint="Must match the language the templates were approved in.">
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
            <Input
              label="Win-back after (days)"
              type="number"
              inputMode="numeric"
              min={7}
              max={365}
              value={draft.winbackDays}
              onChange={(e) => set('winbackDays', e.target.value)}
              error={errors.winbackDays}
              hint="Days without a visit before the win-back message. 7 to 365."
              className="tnum font-mono"
            />
          </div>

          <section aria-labelledby="wa-templates">
            <h4 id="wa-templates" className="eyebrow mb-3">
              Templates
            </h4>
            <div className="grid gap-3 lg:grid-cols-2">
              {JOURNEYS.map((j) => {
                const suggested = j.suggested(restaurant.name);
                return (
                  <div key={j.kind} className="rounded-2xl border border-line/10 p-4">
                    <Input
                      label={`${j.label} template name`}
                      placeholder={j.placeholder}
                      value={draft.templates[j.kind]}
                      onChange={(e) => setTemplate(j.kind, e.target.value)}
                      error={errors[j.kind]}
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="mt-2 text-xs text-muted">{j.when}</p>
                    <p className="mb-1 mt-3 text-xs font-semibold text-fg/80">Body variables, in this order</p>
                    <ol className="flex flex-wrap gap-1.5">
                      {j.variables.map((v, i) => (
                        <li key={v} className="rounded-full bg-sunk px-2.5 py-1 text-xs">
                          <code className="font-mono font-semibold">{`{{${i + 1}}}`}</code> {v}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-3 rounded-xl bg-[#e7f6ec] p-3 text-[13px] leading-relaxed text-[#16352a]">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-[#16352a]/70">Suggested text</span>
                        <button
                          type="button"
                          onClick={() => void copyText(suggested, `${j.label} template text`)}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold hover:bg-[#16352a]/10"
                        >
                          <Copy className="h-3 w-3" aria-hidden /> Copy
                        </button>
                      </div>
                      <p className="break-words">{suggested}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-xs text-muted">Unsaved changes</span>}
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save WhatsApp settings
            </Button>
          </div>
        </form>

        <section aria-labelledby="wa-test" className="rounded-2xl bg-sunk/60 p-4">
          <h4 id="wa-test" className="text-sm font-semibold">
            Send test message
          </h4>
          <p className="mt-0.5 text-xs text-muted">Sends the chosen template to any number, with sample values. Use your own phone.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
            <Input label="Phone" type="tel" inputMode="tel" placeholder="98450 12345" prefix="+91" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="tnum font-mono" />
            <Select label="Journey" value={testKind} onChange={(e) => setTestKind(e.target.value as JourneyKind)}>
              {JOURNEYS.map((j) => (
                <option key={j.kind} value={j.kind}>
                  {j.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="dark" loading={testing} leftIcon={<Send className="h-4 w-4" />} onClick={() => void sendTest()} disabled={dirty || !settings.wa_phone_number_id || !settings.wa_token_set || !testTemplate}>
              Send test
            </Button>
          </div>
          {(dirty || !settings.wa_phone_number_id || !settings.wa_token_set || !testTemplate) && (
            <p className="mt-2 text-xs text-muted">
              {dirty
                ? 'Save your changes first.'
                : !settings.wa_phone_number_id || !settings.wa_token_set
                  ? 'Save the phone number ID and access token first.'
                  : 'Add and save this journey’s template name first.'}
            </p>
          )}
          {testResult && (
            <p
              className={cn('mt-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm', testResult.ok ? 'bg-mint-soft text-[#1b6f49]' : 'bg-rose-soft text-[#a1282c]')}
              role="status"
            >
              {testResult.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 break-words">
                {testResult.ok ? (
                  <>
                    Sent to <span className="tnum font-mono">{formatIndianPhone(testResult.to)}</span>. Message id <span className="font-mono text-xs">{testResult.wamid ?? '—'}</span>
                  </>
                ) : (
                  testResult.error ?? 'WhatsApp did not accept the message.'
                )}
              </span>
            </p>
          )}
        </section>

        <section aria-labelledby="wa-journeys">
          <h4 id="wa-journeys" className="eyebrow mb-3">
            Journeys
          </h4>
          <ul className="grid gap-2 sm:grid-cols-3">
            {JOURNEYS.filter((j) => j.kind !== 'offer').map((j) => {
              const configured = !!settings[j.field];
              return (
                <li key={j.kind} className="rounded-2xl border border-line/10 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{j.label}</p>
                    <Badge tone={ready && configured ? 'mint' : 'neutral'}>{ready && configured ? 'Active' : configured ? 'Ready' : 'No template'}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {j.kind === 'welcome' && 'Sent once after a guest opts in at checkout.'}
                    {j.kind === 'winback' && (
                      <>
                        After <span className="tnum font-mono">{settings.winback_days}</span> days without a visit, once per lapse.
                      </>
                    )}
                    {j.kind === 'reward' && 'When a loyalty reward is unlocked, with the reward code.'}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" loading={running} leftIcon={<Play className="h-4 w-4" />} onClick={() => void runNow()}>
              Run now
            </Button>
            <p className="text-xs text-muted">Delivers pending webhooks and sends any WhatsApp messages that are due. This also happens automatically every 2 minutes.</p>
          </div>
          {runError && (
            <p className="mt-3 rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-[#a1282c]" role="alert">
              {runError}
            </p>
          )}
          {runResult && <RunSummary result={runResult} />}
        </section>

        <section aria-labelledby="wa-log">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 id="wa-log" className="eyebrow">
              Message log
            </h4>
            <Button
              variant="ghost"
              size="sm"
              loading={refreshing}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={async () => {
                setRefreshing(true);
                await reloadMessages();
                setRefreshing(false);
              }}
            >
              Refresh
            </Button>
          </div>
          <MessageLog messages={messages} />
        </section>
      </CardBody>
      {dialog}
    </Card>
  );
}

function RunSummary({ result }: { result: AutomationRunResult }) {
  const w = result.webhooks;
  const m = result.whatsapp;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" role="status">
      <div className="rounded-xl bg-sunk px-3.5 py-3 text-sm">
        <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Webhooks</p>
        <p className="tnum mt-1 font-mono">
          {w.delivered} delivered · {w.failed} failed · {w.pending} pending
        </p>
        {w.skipped_reason && <p className="mt-1 text-xs text-muted">Skipped: {w.skipped_reason}</p>}
      </div>
      <div className="rounded-xl bg-sunk px-3.5 py-3 text-sm">
        <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">WhatsApp</p>
        <p className="tnum mt-1 font-mono">
          {m.sent} sent · {m.failed} failed · {m.due} due
        </p>
        {m.skipped_reason && <p className="mt-1 text-xs text-muted">Skipped: {m.skipped_reason}</p>}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<WhatsAppMessageRow['kind'], string> = {
  welcome: 'Welcome',
  winback: 'Win-back',
  reward: 'Reward',
  offer: 'Offer',
  test: 'Test',
};

function MessageLog({ messages }: { messages: WhatsAppMessageRow[] | null }) {
  if (messages === null) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (messages.length === 0) return <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-muted">No messages yet. Sent and failed messages appear here.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/10">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          <tr>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Time
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Phone
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Kind
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Template
            </th>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/5">
          {messages.map((m) => (
            <tr key={m.id} className="align-top">
              <td className="tnum whitespace-nowrap px-3.5 py-2.5 font-mono text-xs">{formatDateTime(m.created_at)}</td>
              <td className="tnum whitespace-nowrap px-3.5 py-2.5 font-mono text-xs">{formatIndianPhone(m.phone)}</td>
              <td className="px-3.5 py-2.5">{KIND_LABEL[m.kind] ?? m.kind}</td>
              <td className="px-3.5 py-2.5">
                <code className="font-mono text-xs">{m.template}</code>
              </td>
              <td className="px-3.5 py-2.5">
                {m.status === 'sent' ? (
                  <Badge tone="mint" dot>
                    Sent
                  </Badge>
                ) : (
                  <>
                    <Badge tone="rose">Failed</Badge>
                    {m.error && <p className="mt-1 max-w-[300px] break-words text-xs text-[#a1282c]">{m.error}</p>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
