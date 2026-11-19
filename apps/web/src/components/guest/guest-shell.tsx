'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { WifiOff } from 'lucide-react';
import { LangProvider } from './i18n';
import { TableProvider } from './table-provider';
import { SessionCallsProvider } from './use-session-calls';
import { useOnline } from './use-online';

/**
 * Wraps every /t/[code] page: light "paper" theme, phone-width frame on desktop,
 * safe-area padding at the bottom, the guest's waiter requests, the menu language (EN / हिं)
 * and the offline banner.
 * No header here — each page owns its chrome.
 */
export function GuestShell({ code, children }: { code: string; children: React.ReactNode }) {
  const online = useOnline();
  const [bannerH, setBannerH] = React.useState(0);
  const bannerRef = React.useRef<HTMLDivElement>(null);

  // Sticky page headers sit below the banner: they read its height from --guest-offline-h.
  React.useEffect(() => {
    const el = bannerRef.current;
    if (online || !el) {
      setBannerH(0);
      return;
    }
    const measure = () => setBannerH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [online]);

  // Say so when the connection comes back (the banner going away is easy to miss).
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success('Back online');
    }
  }, [online]);

  return (
    <TableProvider code={code}>
      <LangProvider>
        <SessionCallsProvider>
          <div className="theme-light min-h-dvh bg-bg text-fg sm:bg-[#ECE7DC]">
            <div
              className="relative mx-auto min-h-dvh w-full max-w-[560px] bg-bg pb-[env(safe-area-inset-bottom,0px)] sm:border-x sm:border-line/10 sm:shadow-[0_40px_120px_-60px_rgba(12,13,16,0.45)]"
              style={{ '--guest-offline-h': `${online ? 0 : bannerH}px` } as React.CSSProperties}
            >
              {!online && (
                <div
                  ref={bannerRef}
                  role="status"
                  aria-live="polite"
                  className="sticky top-0 z-[35] flex items-start gap-2.5 bg-ink px-4 py-2.5 text-[12.5px] leading-snug text-paper pt-[max(0.625rem,env(safe-area-inset-top,0px))]"
                >
                  <WifiOff className="mt-px h-4 w-4 shrink-0 text-saffron" aria-hidden />
                  <p className="min-w-0">You&apos;re offline. Orders and requests will go through once you&apos;re back online.</p>
                </div>
              )}
              {children}
            </div>
          </div>
        </SessionCallsProvider>
      </LangProvider>
    </TableProvider>
  );
}
