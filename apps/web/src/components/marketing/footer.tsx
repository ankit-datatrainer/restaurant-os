import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/ui';
import { FOOTER_COLUMNS, site } from './site';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-paper/10">
      <div className="container-x pt-16 md:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.2fr_repeat(3,minmax(0,0.6fr))] md:gap-8">
          <div>
            <Logo light />
            <p className="mt-4 font-mono text-2xs uppercase tracking-[0.16em] text-ember">{site.category}</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              From the first order to the next visit. Guests order and pay from the table, your staff run the counter, the kitchen and the bills from one
              system, and you get to know your regulars, with their permission.
            </p>
            <a href={`mailto:${site.email}`} className="mt-5 inline-flex items-center gap-1.5 font-mono text-xs text-fg/80 underline-offset-4 hover:underline">
              {site.email}
            </a>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="eyebrow">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => {
                  const external = 'external' in l && l.external;
                  const cls =
                    'group inline-flex items-center gap-1 text-sm text-fg/75 transition-colors hover:text-fg after:absolute relative after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:ease-out hover:after:origin-left hover:after:scale-x-100';
                  return (
                    <li key={l.href}>
                      {external ? (
                        <a href={l.href} target="_blank" rel="noreferrer" className={cls}>
                          {l.label}
                          <ArrowUpRight className="h-3 w-3 opacity-60" aria-hidden />
                        </a>
                      ) : (
                        <Link href={l.href} className={cls}>
                          {l.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-paper/10 py-6 font-mono text-2xs uppercase tracking-[0.16em] text-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {site.name}. Made in India.
          </p>
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <span>Prices exclude GST</span>
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/admin/login" className="hover:text-fg">
              Staff login
            </Link>
          </p>
        </div>
      </div>

      {/* giant wordmark */}
      <div aria-hidden className="container-x pointer-events-none select-none">
        <p className="mask-fade-b -mb-[0.22em] whitespace-nowrap font-display text-[clamp(4.5rem,17.5vw,17rem)] font-bold leading-none tracking-[-0.05em] text-paper/[0.06]">
          Restaurant<span className="text-ember/[0.12]">OS</span>
        </p>
      </div>
    </footer>
  );
}
