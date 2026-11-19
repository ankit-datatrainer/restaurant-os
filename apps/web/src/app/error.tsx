'use client';

import * as React from 'react';
import { RotateCcw, Home } from 'lucide-react';
import { Button, Logo } from '@/components/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="theme-dark grain relative flex min-h-dvh flex-col bg-bg text-fg">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-rose/[0.14] blur-[150px]" />
      <header className="container-x relative pt-6">
        <Logo light />
      </header>
      <main className="container-x relative flex flex-1 flex-col justify-center py-20">
        <p className="eyebrow text-rose">Something broke</p>
        <h1 className="mt-5 max-w-4xl text-display-lg font-bold">
          The kitchen dropped <span className="font-serif font-normal italic text-ember">a plate.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted">
          The page hit an error it could not recover from. Trying again usually fixes it. If it keeps happening, tell us and quote the code below.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button onClick={reset} size="lg" leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>
            Try again
          </Button>
          <Button href="/" variant="outline" size="lg" leftIcon={<Home className="h-4 w-4" aria-hidden />}>
            Home page
          </Button>
        </div>
        {error.digest && (
          <p className="mt-10 font-mono text-xs text-muted">
            Error code: <span className="text-fg/80">{error.digest}</span>
          </p>
        )}
      </main>
    </div>
  );
}
