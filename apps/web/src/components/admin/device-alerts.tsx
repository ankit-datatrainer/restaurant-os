'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bell, BellOff, CheckCircle2, Send, Share, SquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, publicApi } from '@/lib/api';
import { currentEndpoint, permission, preparePush, pushSupport, registerServiceWorker, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { cn } from '@/lib/utils';
import { Button, Sheet } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { ALERTS_CHANGED_EVENT, announceAlertsChanged, localAlertsMuted, setLocalAlertsMuted } from './alert-prefs';
import { errorMessage } from './format';

/**
 * "Alerts on this device": a system notification for every new order and waiter call.
 *
 * - on         Web Push is saved for this device: alerts arrive even with the tab closed.
 * - open-only  Permission granted, but no push subscription (server push not set up, or not
 *              turned on yet): the open dashboard still shows a notification while it is hidden.
 * - off / denied / ios-install / unsupported: what it says.
 */
export type AlertsStatus = 'checking' | 'on' | 'open-only' | 'off' | 'denied' | 'ios-install' | 'unsupported';

let serverConfig: Promise<boolean> | null = null;
/** Whether this server can send Web Push at all. Errors count as "not available yet". */
function serverPushEnabled(): Promise<boolean> {
  serverConfig ??= publicApi
    .pushConfig()
    .then((c) => Boolean(c.enabled && c.publicKey))
    .catch(() => false);
  return serverConfig;
}

/** Staff id whose subscription was re-saved this page load (keeps the server in step after a sign-in switch). */
let resyncedFor: string | null = null;

export interface DeviceAlerts {
  status: AlertsStatus;
  /** null until the push config has loaded. */
  serverEnabled: boolean | null;
  busy: null | 'on' | 'off' | 'test';
  testResult: { ok: boolean; text: string } | null;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
  sendTest: () => Promise<void>;
}

export function useDeviceAlerts(): DeviceAlerts {
  const { token, staff } = useAdmin();
  const [status, setStatus] = React.useState<AlertsStatus>('checking');
  const [serverEnabled, setServerEnabled] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState<DeviceAlerts['busy']>(null);
  const [testResult, setTestResult] = React.useState<DeviceAlerts['testResult']>(null);
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  const check = React.useCallback(async () => {
    const support = pushSupport();
    if (support === 'ios-needs-install') return setStatus('ios-install');
    if (support === 'unsupported') return setStatus('unsupported');
    const perm = permission();
    if (perm === 'denied') return setStatus('denied');
    // Warm the service worker so a later tap goes straight to the permission prompt.
    preparePush();
    const enabled = await serverPushEnabled();
    setServerEnabled(enabled);
    if (perm !== 'granted' || localAlertsMuted()) return setStatus('off');
    const endpoint = enabled ? await currentEndpoint() : null;
    if (!endpoint) return setStatus('open-only');
    setStatus('on');
    if (resyncedFor !== staff.id) {
      resyncedFor = staff.id;
      // Already allowed: re-save quietly so this device rings for whoever is signed in now.
      try {
        const sub = await subscribeToPush();
        if (sub) await adminApi.staffPushSubscribe(tokenRef.current, sub);
      } catch {
        /* not available yet: the explicit button reports errors */
      }
    }
  }, [staff.id]);

  React.useEffect(() => {
    void check();
    const onChange = () => void check();
    window.addEventListener(ALERTS_CHANGED_EVENT, onChange);
    // Permission can change in browser settings while the tab is in the background.
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.removeEventListener(ALERTS_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [check]);

  const turnOn = React.useCallback(async () => {
    setBusy('on');
    setTestResult(null);
    setLocalAlertsMuted(false);
    try {
      // Called straight from the tap: this is where the browser asks for permission.
      let sub = null;
      try {
        sub = await subscribeToPush();
      } catch {
        sub = null;
      }
      const perm = permission();
      if (perm === 'denied') {
        setStatus('denied');
        toast.error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
        return;
      }
      if (perm !== 'granted') {
        setStatus('off');
        toast.message('Alerts are still off. Tap “Turn on alerts” again and choose Allow.');
        return;
      }
      if (!sub) {
        setStatus('open-only');
        toast.success('Alerts are on while the dashboard is open, even in a background tab.');
        return;
      }
      try {
        await adminApi.staffPushSubscribe(tokenRef.current, sub);
        resyncedFor = staff.id;
        setStatus('on');
        toast.success('Alerts are on. This device will ring for new orders and waiter calls.');
      } catch {
        setStatus('open-only');
        toast.message('Alerts with the dashboard closed are not available yet. You will still get them while the dashboard is open.');
      }
    } finally {
      setBusy(null);
      announceAlertsChanged();
    }
  }, [staff.id]);

  const turnOff = React.useCallback(async () => {
    setBusy('off');
    setTestResult(null);
    setLocalAlertsMuted(true);
    try {
      const endpoint = await unsubscribeFromPush().catch(() => null);
      if (endpoint) await adminApi.staffPushUnsubscribe(tokenRef.current, endpoint).catch(() => undefined);
      setStatus('off');
      toast.success('Alerts are off on this device. Sound alerts on the open dashboard are unchanged.');
    } finally {
      setBusy(null);
      announceAlertsChanged();
    }
  }, []);

  const sendTest = React.useCallback(async () => {
    setBusy('test');
    setTestResult(null);
    try {
      if (status === 'on') {
        const r = await adminApi.staffPushTest(tokenRef.current);
        setTestResult(
          r.delivered > 0
            ? { ok: true, text: `Sent to ${r.delivered} of your ${r.devices} device${r.devices === 1 ? '' : 's'}. It should appear within a few seconds.` }
            : { ok: false, text: `None of your ${r.devices} device${r.devices === 1 ? '' : 's'} could be reached. Turn alerts off and on again on this device.` },
        );
      } else {
        // No server push: show one straight from this page so staff know what an alert looks like.
        const reg = await registerServiceWorker();
        const body = 'This is how a new order or waiter call will look on this device.';
        if (reg) await reg.showNotification('Test alert', { body, tag: 'staff-test', icon: '/icon.svg' });
        else new Notification('Test alert', { body, tag: 'staff-test', icon: '/icon.svg' });
        setTestResult({ ok: true, text: 'A test notification was shown on this device.' });
      }
    } catch (e) {
      setTestResult({ ok: false, text: errorMessage(e, 'Could not send a test alert. Try again in a moment.') });
    } finally {
      setBusy(null);
    }
  }, [status]);

  return { status, serverEnabled, busy, testResult, turnOn, turnOff, sendTest };
}

const DOT: Record<AlertsStatus, string> = {
  checking: 'bg-fg/20',
  on: 'bg-mint',
  'open-only': 'bg-saffron',
  off: 'bg-fg/25',
  denied: 'bg-rose',
  'ios-install': 'bg-fg/25',
  unsupported: 'bg-fg/25',
};

const STATUS_LABEL: Record<AlertsStatus, string> = {
  checking: 'Checking this device…',
  on: 'Alerts are on for this device',
  'open-only': 'On while the dashboard is open',
  off: 'Alerts are off on this device',
  denied: 'Notifications are blocked',
  'ios-install': 'Needs Add to Home Screen',
  unsupported: 'Not supported in this browser',
};

/** The explanation, current state and actions. Used in the topbar sheet and in Settings. */
export function DeviceAlertsPanel({ alerts, className }: { alerts: DeviceAlerts; className?: string }) {
  const { status, serverEnabled, busy, testResult, turnOn, turnOff, sendTest } = alerts;

  return (
    <div className={cn('grid gap-4', className)}>
      <p className="text-sm text-fg/80">
        Get a notification on this phone or laptop for every new order and waiter call — even when this tab is closed. Each device is turned on separately.
      </p>

      <div className="flex items-center gap-2.5 rounded-xl bg-sunk px-3.5 py-2.5" role="status" aria-live="polite">
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[status])} aria-hidden />
        <span className="text-sm font-semibold">{STATUS_LABEL[status]}</span>
      </div>

      {status === 'on' && <p className="text-sm text-muted">Alerts keep coming while this tab is closed or the phone is locked. Tapping one opens the right page.</p>}

      {status === 'open-only' && (
        <p className="text-sm text-muted">
          {serverEnabled
            ? 'You get a notification while the dashboard is open in a background tab. Turn on alerts to also get them when the tab is closed.'
            : 'Alerts with the dashboard closed are not available yet. While the dashboard is open — even in a background tab — you still get a notification, the chime and the voice.'}
        </p>
      )}

      {status === 'off' && serverEnabled === false && (
        <p className="text-sm text-muted">
          Alerts with the dashboard closed are not available yet. Turning this on still gives you a notification whenever the dashboard is open in a background tab.
        </p>
      )}

      {status === 'denied' && (
        <div className="grid gap-1.5 text-sm text-fg/80">
          <p>This browser was told not to show notifications for this site. To allow them:</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Tap the lock or settings icon next to the address bar.</li>
            <li>Open Notifications (or Site settings → Notifications) and choose Allow.</li>
            <li>Reload this page and come back here.</li>
          </ol>
        </div>
      )}

      {status === 'ios-install' && (
        <div className="grid gap-1.5 text-sm text-fg/80">
          <p>On iPhone and iPad, alerts work only from the Home Screen app (iOS 16.4 or later):</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              Tap Share <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="(the share icon)" /> in Safari.
            </li>
            <li>
              Choose Add to Home Screen <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" aria-label="(the plus icon)" />.
            </li>
            <li>Open Restaurant OS from the new icon, sign in and turn on alerts there.</li>
          </ol>
        </div>
      )}

      {status === 'unsupported' && (
        <p className="text-sm text-muted">
          This browser cannot show notifications. Use Chrome on Android, or Chrome, Edge, Firefox or Safari on a laptop. The chime and voice still work while the dashboard is open.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(status === 'off' || (status === 'open-only' && serverEnabled)) && (
          <Button type="button" size="sm" loading={busy === 'on'} disabled={busy !== null} leftIcon={<Bell className="h-4 w-4" />} onClick={() => void turnOn()}>
            Turn on alerts
          </Button>
        )}
        {(status === 'on' || status === 'open-only') && (
          <>
            <Button type="button" size="sm" variant="outline" loading={busy === 'test'} disabled={busy !== null} leftIcon={<Send className="h-4 w-4" />} onClick={() => void sendTest()}>
              Send a test alert
            </Button>
            <Button type="button" size="sm" variant="ghost" loading={busy === 'off'} disabled={busy !== null} leftIcon={<BellOff className="h-4 w-4" />} onClick={() => void turnOff()}>
              Turn off on this device
            </Button>
          </>
        )}
      </div>

      {testResult && (
        <p className={cn('flex items-start gap-2 text-sm', testResult.ok ? 'text-fg/80' : 'text-[#a1282c]')} role="status">
          {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {testResult.text}
        </p>
      )}
    </div>
  );
}

/** Topbar bell with a state dot; opens the alerts sheet. */
export function DeviceAlertsButton() {
  const alerts = useDeviceAlerts();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const label = `Alerts on this device: ${STATUS_LABEL[alerts.status].toLowerCase()}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className={cn('relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg/75 transition hover:bg-fg/5 hover:text-fg', open && 'bg-fg/5 text-fg')}
      >
        {alerts.status === 'on' || alerts.status === 'open-only' ? <Bell className="h-[18px] w-[18px]" aria-hidden /> : <BellOff className="h-[18px] w-[18px]" aria-hidden />}
        <span className={cn('absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-surface', DOT[alerts.status])} aria-hidden />
      </button>
      {/* The topbar is a blurred sticky layer, which would trap a fixed sheet inside it: render at the body. */}
      {mounted &&
        createPortal(
          <div className="theme-admin">
            <Sheet open={open} onClose={() => setOpen(false)} title="Alerts on this device" description="New orders and waiter calls, as phone or laptop notifications.">
              <DeviceAlertsPanel alerts={alerts} />
            </Sheet>
          </div>,
          document.body,
        )}
    </>
  );
}
