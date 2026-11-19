import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiningTable } from '@restaurant-os/shared';
import { config } from '../config.js';
import { fromSupabase, notFound } from '../lib/errors.js';

/** Mirrors the dining_tables_code_format check constraint. */
export const TABLE_CODE_RE = /^[A-Z0-9]{3,12}$/;

/** No 0/O/1/I so codes survive being read out loud or hand-typed. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTableCode(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Full guest URL encoded in the table's QR code. */
export function tableUrl(code: string): string {
  return `${config.appUrl}/t/${code}`;
}

export async function fetchTable(db: SupabaseClient, restaurantId: string, id: string): Promise<DiningTable> {
  const { data, error } = await db.from('dining_tables').select('*').eq('restaurant_id', restaurantId).eq('id', id).maybeSingle();
  if (error) throw fromSupabase(error);
  if (!data) throw notFound('Table not found');
  return data as DiningTable;
}
