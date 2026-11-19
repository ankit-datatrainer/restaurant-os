import type { ReactNode } from 'react';
import { SmoothScroll } from '@/components/ui';
import { BackToTop } from '@/components/marketing/back-to-top';
import { Cursor } from '@/components/marketing/cursor';
import { Footer } from '@/components/marketing/footer';
import { Nav } from '@/components/marketing/nav';
import { ScrollSync } from '@/components/marketing/scroll-sync';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark min-h-dvh bg-bg text-fg">
      <SmoothScroll>
        <ScrollSync />
        <a
          href="#main"
          className="sr-only z-[70] rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main" className="relative">
          {children}
        </main>
        <Footer />
        <BackToTop />
        <Cursor />
      </SmoothScroll>
    </div>
  );
}
