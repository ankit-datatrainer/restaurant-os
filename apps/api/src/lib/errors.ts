import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Sign in required') => new HttpError(401, msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Translate a Supabase/PostgREST error into an HttpError. */
export function fromSupabase(error: { message: string; code?: string; details?: string | null } | null, fallback = 'Database error'): HttpError {
  if (!error) return new HttpError(500, fallback);
  const msg = error.message || fallback;
  if (error.code === 'PGRST116') return notFound();
  if (error.code === '23505') return conflict(msg);
  if (error.code === '42501' || /row-level security/i.test(msg)) return forbidden(msg);
  if (error.code === 'P0001' || error.code === '22023') return badRequest(msg);
  return new HttpError(500, msg, error.details ?? undefined);
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: message });
}
