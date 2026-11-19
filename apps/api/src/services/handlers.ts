import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import type { StaffRequest } from '../middleware/auth.js';

export type StaffHandlerFn = (req: StaffRequest, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Like asyncHandler, but the handler receives the request as a StaffRequest
 * (requireStaff must run before it). Keeps Express's router typings happy.
 */
export function staffHandler(fn: StaffHandlerFn): RequestHandler {
  const wrapped = asyncHandler<StaffRequest>(fn);
  return (req, res, next) => wrapped(req as StaffRequest, res, next);
}

/** Validate with zod and turn the first issue into a readable 400. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.join('.');
  const message = issue ? (path ? `${path}: ${issue.message}` : issue.message) : 'Invalid request';
  throw badRequest(message, result.error.flatten());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Read a route param that must be a UUID; a malformed id is simply "not found". */
export function uuidParam(value: unknown, message = 'Not found'): string {
  if (!isUuid(value)) throw notFound(message);
  return value;
}

/** First string value of a query-string entry (`?a=1&a=2` → "1"). */
export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Pick the given keys from req.query as plain strings, dropping blanks. */
export function pickQuery(query: Request['query'], keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = queryString(query[key]);
    if (v !== undefined && v.trim() !== '') out[key] = v.trim();
  }
  return out;
}

/** Coerce a numeric column that may arrive as a string into a number. */
export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
