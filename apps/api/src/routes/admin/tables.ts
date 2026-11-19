import { Router } from 'express';
import QRCode from 'qrcode';
import type { DiningTable } from '@restaurant-os/shared';
import { badRequest, conflict, fromSupabase, notFound } from '../../lib/errors.js';
import { parse, staffHandler, uuidParam } from '../../services/handlers.js';
import { tableCreateSchema, tableUpdateSchema } from '../../services/schemas.js';
import { fetchTable, generateTableCode, tableUrl } from '../../services/tables.js';

const CODE_ATTEMPTS = 6;
const CODE_IN_USE = 'That table code is already in use. Pick another one.';
const QR_COLORS = { dark: '#0C0D10', light: '#FFFFFF' };

export const tablesRouter = Router();

tablesRouter.get(
  '/',
  staffHandler(async (req, res) => {
    const { data, error } = await req.auth.db
      .from('dining_tables')
      .select('*')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as DiningTable[]);
  }),
);

tablesRouter.post(
  '/',
  staffHandler(async (req, res) => {
    const input = parse(tableCreateSchema, req.body);
    const base = {
      restaurant_id: req.auth.restaurant.id,
      label: input.label,
      area: input.area ?? null,
      seats: input.seats ?? 4,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    };

    // A user-supplied code is tried once; a generated one is retried on collision.
    const attempts = input.code ? 1 : CODE_ATTEMPTS;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const code = input.code ?? generateTableCode();
      const { data, error } = await req.auth.db.from('dining_tables').insert({ ...base, code }).select('*').single();
      if (!error) {
        res.status(201).json(data as DiningTable);
        return;
      }
      if (error.code !== '23505') throw fromSupabase(error);
      if (input.code) throw conflict(CODE_IN_USE);
    }
    throw conflict('Could not find a free table code. Please try again.');
  }),
);

tablesRouter.patch(
  '/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Table not found');
    const patch = parse(tableUpdateSchema, req.body);
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    const { data, error } = await req.auth.db
      .from('dining_tables')
      .update(patch)
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('*')
      .maybeSingle();
    if (error) throw error.code === '23505' ? conflict(CODE_IN_USE) : fromSupabase(error);
    if (!data) throw notFound('Table not found');
    res.json(data as DiningTable);
  }),
);

// DELETE /api/admin/tables/:id → 204. A table with orders on record (orders.table_id is
// `on delete restrict`) is deactivated instead, so order history stays intact, and the
// deactivated row comes back with 200.
tablesRouter.delete(
  '/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Table not found');
    const { data, error } = await req.auth.db
      .from('dining_tables')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('id');
    if (error) {
      if (error.code === '23503') {
        const { data: row, error: updErr } = await req.auth.db
          .from('dining_tables')
          .update({ is_active: false })
          .eq('id', id)
          .eq('restaurant_id', req.auth.restaurant.id)
          .select('*')
          .maybeSingle();
        if (updErr) throw fromSupabase(updErr);
        if (!row) throw notFound('Table not found');
        res.json(row as DiningTable);
        return;
      }
      throw fromSupabase(error);
    }
    if (!data || data.length === 0) throw notFound('Table not found');
    res.status(204).end();
  }),
);

tablesRouter.post(
  '/:id/reset-code',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Table not found');
    await fetchTable(req.auth.db, req.auth.restaurant.id, id);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const { data, error } = await req.auth.db
        .from('dining_tables')
        .update({ code: generateTableCode() })
        .eq('id', id)
        .eq('restaurant_id', req.auth.restaurant.id)
        .select('*')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') continue;
        throw fromSupabase(error);
      }
      if (!data) throw notFound('Table not found');
      res.json(data as DiningTable);
      return;
    }
    throw conflict('Could not find a free table code. Please try again.');
  }),
);

// ---------------------------------------------------------------------------
// QR images (auth header or ?token= — see tokenFromQuery in ./index.ts)
// ---------------------------------------------------------------------------
tablesRouter.get(
  '/:id/qr.svg',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Table not found');
    const table = await fetchTable(req.auth.db, req.auth.restaurant.id, id);
    const svg = await QRCode.toString(tableUrl(table.code), { type: 'svg', margin: 1, color: QR_COLORS });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="table-${table.code}.svg"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(svg);
  }),
);

tablesRouter.get(
  '/:id/qr.png',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Table not found');
    const table = await fetchTable(req.auth.db, req.auth.restaurant.id, id);
    const png = await QRCode.toBuffer(tableUrl(table.code), { type: 'png', margin: 1, width: 512, color: QR_COLORS });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="table-${table.code}.png"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(png);
  }),
);
