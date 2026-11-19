import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per window per bucket. */
  max: number;
  /** Only count these HTTP methods (others pass straight through). */
  methods?: readonly string[];
  /**
   * What a bucket is keyed on. Defaults to the client IP. A venue's Wi-Fi (or a carrier CGNAT)
   * puts every guest behind one IP, so guest writes should key on something per guest instead.
   */
  key?: (req: Request) => string;
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Tiny in-memory fixed-window rate limiter. Good enough for one API process;
 * swap for a shared store if the API is ever scaled horizontally.
 */
export function rateLimit(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const keyOf = opts.key ?? clientIp;

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, opts.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (opts.methods && !opts.methods.includes(req.method)) return next();

    const key = keyOf(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - bucket.count)));

    if (bucket.count > opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return next(new HttpError(429, `Too many requests. Please wait ${retryAfter} seconds and try again.`));
    }
    next();
  };
}
