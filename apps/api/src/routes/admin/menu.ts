import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MenuCategory, MenuItem } from '@restaurant-os/shared';
import { HttpError, badRequest, conflict, fromSupabase, notFound } from '../../lib/errors.js';
import { parse, staffHandler, uuidParam } from '../../services/handlers.js';
import { categoryCreateSchema, categoryUpdateSchema, itemCreateSchema, itemUpdateSchema } from '../../services/schemas.js';

export const menuRouter = Router();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
menuRouter.get(
  '/categories',
  staffHandler(async (req, res) => {
    const { data, error } = await req.auth.db
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as MenuCategory[]);
  }),
);

menuRouter.post(
  '/categories',
  staffHandler(async (req, res) => {
    const input = parse(categoryCreateSchema, req.body);
    const { data, error } = await req.auth.db
      .from('menu_categories')
      .insert({ ...input, restaurant_id: req.auth.restaurant.id })
      .select('*')
      .single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as MenuCategory);
  }),
);

menuRouter.patch(
  '/categories/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Category not found');
    const patch = parse(categoryUpdateSchema, req.body);
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');

    const { data, error } = await req.auth.db
      .from('menu_categories')
      .update(patch)
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('*')
      .maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Category not found');
    res.json(data as MenuCategory);
  }),
);

menuRouter.delete(
  '/categories/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Category not found');

    const { count, error: countErr } = await req.auth.db
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
      .eq('restaurant_id', req.auth.restaurant.id);
    if (countErr) throw fromSupabase(countErr);
    if ((count ?? 0) > 0) {
      throw conflict(`This category still has ${count} ${count === 1 ? 'dish' : 'dishes'}. Move or delete them first.`);
    }

    const { data, error } = await req.auth.db
      .from('menu_categories')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('id');
    if (error) throw fromSupabase(error);
    if (!data || data.length === 0) throw notFound('Category not found');
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
async function assertCategoryOwned(db: SupabaseClient, restaurantId: string, categoryId: string): Promise<void> {
  const { data, error } = await db.from('menu_categories').select('id').eq('id', categoryId).eq('restaurant_id', restaurantId).maybeSingle();
  if (error) throw fromSupabase(error);
  if (!data) throw badRequest('Choose a category from your own menu');
}

menuRouter.get(
  '/items',
  staffHandler(async (req, res) => {
    const { data, error } = await req.auth.db
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as MenuItem[]);
  }),
);

menuRouter.post(
  '/items',
  staffHandler(async (req, res) => {
    const input = parse(itemCreateSchema, req.body);
    await assertCategoryOwned(req.auth.db, req.auth.restaurant.id, input.category_id);

    const { data, error } = await req.auth.db
      .from('menu_items')
      .insert({ ...input, restaurant_id: req.auth.restaurant.id })
      .select('*')
      .single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as MenuItem);
  }),
);

menuRouter.patch(
  '/items/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Dish not found');
    const patch = parse(itemUpdateSchema, req.body);
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');
    if (patch.category_id) await assertCategoryOwned(req.auth.db, req.auth.restaurant.id, patch.category_id);

    const { data, error } = await req.auth.db
      .from('menu_items')
      .update(patch)
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('*')
      .maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Dish not found');
    res.json(data as MenuItem);
  }),
);

menuRouter.delete(
  '/items/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Dish not found');
    const { data, error } = await req.auth.db
      .from('menu_items')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select('id');
    if (error) throw fromSupabase(error);
    if (!data || data.length === 0) throw notFound('Dish not found');
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Image upload → Supabase storage bucket "menu-images"
// ---------------------------------------------------------------------------
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest('Only JPEG, PNG, WebP or AVIF images are allowed'));
  },
});
const uploadSingle = upload.single('file');

/** Runs multer and turns its errors into 400s instead of stack traces. */
function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  uploadSingle(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller' : err.message;
      return next(badRequest(message));
    }
    if (err instanceof HttpError) return next(err);
    next(badRequest('Upload failed. Please try another image.'));
  });
}

function safeFileName(originalName: string, mimetype: string): string {
  const ext = IMAGE_TYPES[mimetype] ?? path.extname(originalName).toLowerCase() ?? '';
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'dish'}${ext}`;
}

menuRouter.post(
  '/upload',
  uploadMiddleware,
  staffHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Attach an image in the "file" field');

    const objectPath = `${req.auth.restaurant.id}/${Date.now()}-${safeFileName(file.originalname, file.mimetype)}`;
    const bucket = req.auth.db.storage.from('menu-images');
    const { error } = await bucket.upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw fromSupabase(error, 'Could not upload the image');

    const { data } = bucket.getPublicUrl(objectPath);
    res.json({ url: data.publicUrl });
  }),
);
