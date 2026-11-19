import { Router } from 'express';
import type { LoyaltyProgram, LoyaltyReward } from '@restaurant-os/shared';
import { forbidden, fromSupabase } from '../../lib/errors.js';
import { parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';
import { loyaltyProgramSchema, rewardsQuerySchema } from '../../services/schemas.js';

export const loyaltyRouter = Router();

const DEFAULT_PROGRAM = { enabled: false, visits_required: 5, reward_text: 'A free dessert of your choice', reward_expiry_days: 60 };

// GET /api/admin/loyalty → program (defaults when never saved) + counts
loyaltyRouter.get(
  '/',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'loyalty');
    const rid = req.auth.restaurant.id;
    const [prog, active, redeemed] = await Promise.all([
      req.auth.db.from('loyalty_programs').select('*').eq('restaurant_id', rid).maybeSingle(),
      req.auth.db.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('restaurant_id', rid).is('redeemed_at', null).gt('expires_at', new Date().toISOString()),
      req.auth.db.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('restaurant_id', rid).not('redeemed_at', 'is', null),
    ]);
    if (prog.error) throw fromSupabase(prog.error);
    const program: LoyaltyProgram = (prog.data as LoyaltyProgram | null) ?? { restaurant_id: rid, ...DEFAULT_PROGRAM, updated_at: new Date(0).toISOString() };
    res.json({ program, stats: { active: active.count ?? 0, redeemed: redeemed.count ?? 0 } });
  }),
);

// PUT /api/admin/loyalty → save the program (owners / managers)
loyaltyRouter.put(
  '/',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'loyalty');
    if (!['owner', 'manager'].includes(req.auth.staff.role)) throw forbidden('Only owners and managers can change the loyalty program.');
    const patch = parse(loyaltyProgramSchema, req.body);
    const rid = req.auth.restaurant.id;
    const existing = await req.auth.db.from('loyalty_programs').select('*').eq('restaurant_id', rid).maybeSingle();
    if (existing.error) throw fromSupabase(existing.error);
    const row = { ...DEFAULT_PROGRAM, ...(existing.data ?? {}), ...patch, restaurant_id: rid, updated_at: new Date().toISOString() };
    const { data, error } = await req.auth.db.from('loyalty_programs').upsert(row, { onConflict: 'restaurant_id' }).select('*').single();
    if (error) throw fromSupabase(error);
    res.json(data as LoyaltyProgram);
  }),
);

// GET /api/admin/loyalty/rewards?status=active|redeemed|expired|all
loyaltyRouter.get(
  '/rewards',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'loyalty');
    const q = parse(rewardsQuerySchema, pickQuery(req.query, ['status']));
    const now = new Date().toISOString();
    let query = req.auth.db
      .from('loyalty_rewards')
      .select('*, customer:customers(name, phone)')
      .eq('restaurant_id', req.auth.restaurant.id)
      .order('earned_at', { ascending: false })
      .limit(200);
    const status = q.status ?? 'active';
    if (status === 'active') query = query.is('redeemed_at', null).gt('expires_at', now);
    if (status === 'redeemed') query = query.not('redeemed_at', 'is', null);
    if (status === 'expired') query = query.is('redeemed_at', null).lte('expires_at', now);
    const { data, error } = await query;
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as LoyaltyReward[]);
  }),
);

// POST /api/admin/loyalty/rewards/:id/redeem
loyaltyRouter.post(
  '/rewards/:id/redeem',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'loyalty');
    const id = uuidParam(req.params.id, 'Reward not found');
    const { data, error } = await req.auth.db.rpc('redeem_loyalty_reward', { p_reward_id: id });
    if (error) throw fromSupabase(error);
    res.json(data as LoyaltyReward);
  }),
);
