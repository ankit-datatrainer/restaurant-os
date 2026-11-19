import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Button, Logo } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Table not found',
  description: 'This page does not exist.',
};

export default function NotFound() {
  return (
    <div className="theme-dark grain relative flex min-h-dvh flex-col bg-bg text-fg">
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-ember/[0.16] blur-[150px]" />
      <header className="container-x relative pt-6">
        <Logo light />
      </header>
      <main className="container-x relative flex flex-1 flex-col justify-center py-20">
        <p className="eyebrow text-ember">Error 404</p>
        <h1 className="mt-5 max-w-4xl text-display-lg font-bold">
          This table <span className="font-serif font-normal italic text-ember">doesn’t exist.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted">
          Someone may have moved it for a birthday party, or the link is older than our menu. Either way, nothing was ordered and nothing was charged.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button href="/" size="lg" leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            Back to the home page
          </Button>
          <Button href="/demo" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
            Open the demo instead
          </Button>
        </div>
        <p className="mt-12 font-mono text-xs text-muted">
          Looking for a table’s menu? The address looks like{' '}
          <Link href="/demo" className="text-fg underline underline-offset-4">
            /t/&lt;table-code&gt;
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
