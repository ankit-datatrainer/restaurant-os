'use client';

import * as React from 'react';

/** A ticking timestamp for elapsed-time labels. Re-renders every `intervalMs`. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
