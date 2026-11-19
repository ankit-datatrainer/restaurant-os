/**
 * WhatsApp Cloud API (Meta) — template messages.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages
 *
 * Business-initiated messages must use a template that Meta has approved. Each journey sends its
 * template with body variables in this fixed order (create the templates in WhatsApp Manager to match):
 *   welcome : {{1}} guest name, {{2}} restaurant, {{3}} unsubscribe link
 *   winback : {{1}} guest name, {{2}} restaurant, {{3}} unsubscribe link
 *   reward  : {{1}} guest name, {{2}} reward, {{3}} reward code, {{4}} unsubscribe link
 *   offer   : {{1}} guest name, {{2}} offer text, {{3}} unsubscribe link
 */
const API_BASE = (process.env.WHATSAPP_API_BASE ?? 'https://graph.facebook.com/v21.0').replace(/\/$/, '');

export interface SendResult {
  ok: boolean;
  wamid: string | null;
  error: string | null;
}

export async function sendTemplate(input: {
  phoneNumberId: string;
  accessToken: string;
  /** +91XXXXXXXXXX */
  to: string;
  template: string;
  language: string;
  params: string[];
}): Promise<SendResult> {
  const body = {
    messaging_product: 'whatsapp',
    to: input.to.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.language },
      components: input.params.length
        ? [{ type: 'body', parameters: input.params.map((text) => ({ type: 'text', text: text.slice(0, 1000) || '-' })) }]
        : [],
    },
  };
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number; error_data?: { details?: string } };
    };
    if (!res.ok || data.error) {
      const e = data.error;
      const msg = e ? `${e.message ?? 'WhatsApp error'}${e.error_data?.details ? ` — ${e.error_data.details}` : ''}${e.code ? ` (code ${e.code})` : ''}` : `HTTP ${res.status}`;
      return { ok: false, wamid: null, error: msg.slice(0, 500) };
    }
    return { ok: true, wamid: data.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, wamid: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}
