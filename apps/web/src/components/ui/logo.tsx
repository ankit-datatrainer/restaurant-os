import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn('shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="currentColor" className="text-ink" />
      <path d="M14 38h36" stroke="#F7F4EE" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 38a14 14 0 0 1 28 0" fill="#FF5C2A" />
      <circle cx="32" cy="20" r="3" fill="#F7F4EE" />
      <path d="M12 46h40" stroke="#F2B33D" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, href = '/', light }: { className?: string; href?: string; light?: boolean }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight', className)} aria-label="Restaurant OS home">
      <LogoMark className={light ? 'text-paper' : 'text-ink'} />
      <span>
        Restaurant<span className="text-ember">OS</span>
      </span>
    </Link>
  );
}
