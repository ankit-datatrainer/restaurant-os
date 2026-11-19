import { Router } from 'express';
import type { DishCost, Ingredient, PurchaseOrder, RecipeItem, StockMovement, Supplier } from '@restaurant-os/shared';
import { badRequest, fromSupabase, notFound } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireFeature, requireManager } from '../../services/plan.js';
import {
  ingredientCreateSchema,
  ingredientUpdateSchema,
  movementsQuerySchema,
  purchaseOrderCreateSchema,
  purchaseOrderUpdateSchema,
  purchaseOrdersQuerySchema,
  receiveSchema,
  recipeSchema,
  stockMovementSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
} from '../../services/schemas.js';
import type { StaffRequest } from '../../middleware/auth.js';

export const inventoryRouter = Router();

function gate(req: StaffRequest, write = false) {
  requireFeature(req.auth.restaurant.plan, 'inventory');
  if (write) requireManager(req.auth.staff.role, 'change inventory');
}

const PO_SELECT = '*, supplier:suppliers(id,name,phone), items:purchase_order_items(*, ingredient:ingredients(id,name,unit))';

// ----- Ingredients ---------------------------------------------------------------

inventoryRouter.get(
  '/ingredients',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db.from('ingredients').select('*').eq('restaurant_id', req.auth.restaurant.id).order('name');
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Ingredient[]);
  }),
);

inventoryRouter.post(
  '/ingredients',
  staffHandler(async (req, res) => {
    gate(req, true);
    const { opening_qty, ...input } = parse(ingredientCreateSchema, req.body);
    const { data, error } = await req.auth.db
      .from('ingredients')
      .insert({ ...input, restaurant_id: req.auth.restaurant.id, stock_qty: 0 })
      .select('*')
      .single();
    if (error) throw fromSupabase(error.code === '23505' ? { ...error, message: `${input.name} is already in your ingredients.` } : error);
    let row = data as Ingredient;
    if (opening_qty && opening_qty > 0) {
      const mv = await req.auth.db.rpc('record_stock_movement', {
        p_ingredient_id: row.id,
        p_change: opening_qty,
        p_reason: 'opening',
        p_note: 'Opening stock',
        p_unit_cost: input.avg_cost ?? null,
      });
      if (mv.error) throw fromSupabase(mv.error);
      const again = await req.auth.db.from('ingredients').select('*').eq('id', row.id).single();
      if (again.error) throw fromSupabase(again.error);
      row = again.data as Ingredient;
    }
    res.status(201).json(row);
  }),
);

inventoryRouter.patch(
  '/ingredients/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Ingredient not found');
    const patch = parse(ingredientUpdateSchema, req.body);
    const { data, error } = await req.auth.db.from('ingredients').update(patch).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Ingredient not found');
    res.json(data as Ingredient);
  }),
);

inventoryRouter.delete(
  '/ingredients/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Ingredient not found');
    const { error } = await req.auth.db.from('ingredients').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error?.code === '23503') {
      // Used on a purchase order: keep the history, hide the ingredient.
      const { data, error: e2 } = await req.auth.db.from('ingredients').update({ is_active: false }).eq('id', id).select('*').single();
      if (e2) throw fromSupabase(e2);
      res.json(data as Ingredient);
      return;
    }
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// POST /api/admin/inventory/ingredients/:id/movements { reason: waste|adjustment|opening, quantity, unit_cost?, note? }
// adjustment: `quantity` is the counted stock; the difference is recorded.
inventoryRouter.post(
  '/ingredients/:id/movements',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Ingredient not found');
    const input = parse(stockMovementSchema, req.body);
    let change = input.quantity;
    if (input.reason === 'waste') change = -input.quantity;
    if (input.reason === 'adjustment') {
      const cur = await req.auth.db.from('ingredients').select('stock_qty').eq('id', id).eq('restaurant_id', req.auth.restaurant.id).maybeSingle();
      if (cur.error) throw fromSupabase(cur.error);
      if (!cur.data) throw notFound('Ingredient not found');
      change = Math.round((input.quantity - num(cur.data.stock_qty)) * 1000) / 1000;
      if (change === 0) throw badRequest('The counted stock matches the system. Nothing to change.');
    }
    const { data, error } = await req.auth.db.rpc('record_stock_movement', {
      p_ingredient_id: id,
      p_change: change,
      p_reason: input.reason,
      p_note: input.note ?? null,
      p_unit_cost: input.unit_cost ?? null,
    });
    if (error) throw fromSupabase(error);
    res.status(201).json(data as StockMovement);
  }),
);

inventoryRouter.get(
  '/movements',
  staffHandler(async (req, res) => {
    gate(req);
    const q = parse(movementsQuerySchema, pickQuery(req.query, ['ingredient_id', 'reason', 'since']));
    let query = req.auth.db.from('stock_movements').select('*, ingredient:ingredients(id,name,unit)').eq('restaurant_id', req.auth.restaurant.id);
    if (q.ingredient_id) query = query.eq('ingredient_id', q.ingredient_id);
    if (q.reason) query = query.eq('reason', q.reason);
    if (q.since) query = query.gte('created_at', q.since);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(300);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as StockMovement[]);
  }),
);

// ----- Recipes & food cost --------------------------------------------------------

inventoryRouter.get(
  '/recipes',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db
      .from('recipe_items')
      .select('*, ingredient:ingredients!inner(id,name,unit,avg_cost,restaurant_id)')
      .eq('ingredient.restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as RecipeItem[]);
  }),
);

// PUT /api/admin/inventory/recipes/:menuItemId { lines: [{ ingredient_id, quantity }] } → replaces the recipe
inventoryRouter.put(
  '/recipes/:menuItemId',
  staffHandler(async (req, res) => {
    gate(req, true);
    const menuItemId = uuidParam(req.params.menuItemId, 'Dish not found');
    const { lines } = parse(recipeSchema, req.body);
    const rid = req.auth.restaurant.id;
    const dish = await req.auth.db.from('menu_items').select('id').eq('id', menuItemId).eq('restaurant_id', rid).maybeSingle();
    if (dish.error) throw fromSupabase(dish.error);
    if (!dish.data) throw notFound('Dish not found');
    if (lines.length) {
      const ings = await req.auth.db.from('ingredients').select('id').eq('restaurant_id', rid).in('id', lines.map((l) => l.ingredient_id));
      if (ings.error) throw fromSupabase(ings.error);
      if ((ings.data ?? []).length !== lines.length) throw badRequest('One of the ingredients was not found.');
    }
    const del = await req.auth.db.from('recipe_items').delete().eq('menu_item_id', menuItemId);
    if (del.error) throw fromSupabase(del.error);
    if (lines.length) {
      const ins = await req.auth.db.from('recipe_items').insert(lines.map((l) => ({ menu_item_id: menuItemId, ingredient_id: l.ingredient_id, quantity: l.quantity })));
      if (ins.error) throw fromSupabase(ins.error);
    }
    const { data, error } = await req.auth.db.from('recipe_items').select('*, ingredient:ingredients(id,name,unit,avg_cost)').eq('menu_item_id', menuItemId);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as RecipeItem[]);
  }),
);

inventoryRouter.get(
  '/dish-costs',
  staffHandler(async (req, res) => {
    gate(req);
    const rid = req.auth.restaurant.id;
    const [costs, items] = await Promise.all([
      req.auth.db.rpc('dish_costs', { p_restaurant_id: rid }),
      req.auth.db.from('menu_items').select('id, name, price').eq('restaurant_id', rid).order('name'),
    ]);
    if (costs.error) throw fromSupabase(costs.error);
    if (items.error) throw fromSupabase(items.error);
    const byId = new Map(((costs.data ?? []) as Array<{ menu_item_id: string; food_cost: number; ingredients: number }>).map((c) => [c.menu_item_id, c]));
    const out: DishCost[] = (items.data ?? []).map((m) => {
      const c = byId.get(m.id as string);
      const price = num(m.price);
      const cost = num(c?.food_cost);
      const n = c?.ingredients ?? 0;
      return {
        menu_item_id: m.id as string,
        name: m.name as string,
        price,
        food_cost: cost,
        food_cost_pct: n > 0 && price > 0 ? Math.round((cost / price) * 1000) / 10 : null,
        ingredients: n,
      };
    });
    res.json(out);
  }),
);

// ----- Suppliers -------------------------------------------------------------------

inventoryRouter.get(
  '/suppliers',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db.from('suppliers').select('*').eq('restaurant_id', req.auth.restaurant.id).order('name');
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Supplier[]);
  }),
);

inventoryRouter.post(
  '/suppliers',
  staffHandler(async (req, res) => {
    gate(req, true);
    const input = parse(supplierCreateSchema, req.body);
    const { data, error } = await req.auth.db.from('suppliers').insert({ ...input, restaurant_id: req.auth.restaurant.id }).select('*').single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as Supplier);
  }),
);

inventoryRouter.patch(
  '/suppliers/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Supplier not found');
    const patch = parse(supplierUpdateSchema, req.body);
    const { data, error } = await req.auth.db.from('suppliers').update(patch).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Supplier not found');
    res.json(data as Supplier);
  }),
);

inventoryRouter.delete(
  '/suppliers/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Supplier not found');
    const { error } = await req.auth.db.from('suppliers').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ----- Purchase orders -------------------------------------------------------------

inventoryRouter.get(
  '/purchase-orders',
  staffHandler(async (req, res) => {
    gate(req);
    const q = parse(purchaseOrdersQuerySchema, pickQuery(req.query, ['status']));
    let query = req.auth.db.from('purchase_orders').select(PO_SELECT).eq('restaurant_id', req.auth.restaurant.id);
    if (q.status === 'open') query = query.in('status', ['draft', 'ordered', 'partially_received']);
    else if (q.status && q.status !== 'all') query = query.eq('status', q.status);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as PurchaseOrder[]);
  }),
);

inventoryRouter.post(
  '/purchase-orders',
  staffHandler(async (req, res) => {
    gate(req, true);
    const input = parse(purchaseOrderCreateSchema, req.body);
    const rid = req.auth.restaurant.id;
    const last = await req.auth.db.from('purchase_orders').select('po_number').eq('restaurant_id', rid).order('po_number', { ascending: false }).limit(1);
    if (last.error) throw fromSupabase(last.error);
    const total = Math.round(input.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0) * 100) / 100;
    const head = {
      restaurant_id: rid,
      supplier_id: input.supplier_id ?? null,
      po_number: (num(last.data?.[0]?.po_number) || 0) + 1,
      status: input.place ? 'ordered' : 'draft',
      expected_on: input.expected_on ?? null,
      note: input.note ?? null,
      total,
      created_by: req.auth.staff.id,
    };
    const po = await req.auth.db.from('purchase_orders').insert(head).select('id').single();
    if (po.error) throw fromSupabase(po.error);
    const poId = (po.data as { id: string }).id;
    const items = await req.auth.db
      .from('purchase_order_items')
      .insert(input.items.map((i) => ({ purchase_order_id: poId, ingredient_id: i.ingredient_id, quantity: i.quantity, unit_cost: i.unit_cost })));
    if (items.error) {
      await req.auth.db.from('purchase_orders').delete().eq('id', poId);
      throw fromSupabase(items.error);
    }
    const { data, error } = await req.auth.db.from('purchase_orders').select(PO_SELECT).eq('id', poId).single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as PurchaseOrder);
  }),
);

inventoryRouter.patch(
  '/purchase-orders/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Purchase order not found');
    const patch = parse(purchaseOrderUpdateSchema, req.body);
    const cur = await req.auth.db.from('purchase_orders').select('status').eq('id', id).eq('restaurant_id', req.auth.restaurant.id).maybeSingle();
    if (cur.error) throw fromSupabase(cur.error);
    if (!cur.data) throw notFound('Purchase order not found');
    const status = cur.data.status as string;
    if (['received', 'cancelled'].includes(status)) throw badRequest(`This purchase order is already ${status}.`);
    if (patch.status === 'cancelled' && status === 'partially_received') throw badRequest('Part of this order was received. Receive the rest or leave it open.');
    const { data, error } = await req.auth.db.from('purchase_orders').update(patch).eq('id', id).select(PO_SELECT).single();
    if (error) throw fromSupabase(error);
    res.json(data as PurchaseOrder);
  }),
);

// POST /api/admin/inventory/purchase-orders/:id/receive { lines: [{ item_id, received_qty, unit_cost? }] }
inventoryRouter.post(
  '/purchase-orders/:id/receive',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Purchase order not found');
    const { lines } = parse(receiveSchema, req.body);
    const { error } = await req.auth.db.rpc('receive_purchase_order', { p_po_id: id, p_lines: lines });
    if (error) throw fromSupabase(error, 'Could not receive the stock');
    const { data, error: e2 } = await req.auth.db.from('purchase_orders').select(PO_SELECT).eq('id', id).single();
    if (e2) throw fromSupabase(e2);
    res.json(data as PurchaseOrder);
  }),
);
