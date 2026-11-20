import { Router } from 'express';
import { badRequest, fromSupabase } from '../../lib/errors.js';
import { parse, staffHandler } from '../../services/handlers.js';
import { pushEnabled, sendPush, type PushTarget } from '../../services/push.js';
import { pushEndpointSchema, staffPushSchema } from '../../services/schemas.js';

export const pushRouter = Router();

// POST /api/admin/push/subscribe { subscription } → this device gets new-order and waiter-call alerts
pushRouter.post(
  '/subscribe',
  staffHandler(async (req, res) => {
    if (!pushEnabled) throw badRequest('Notifications are not set up on this server yet.');
    const { subscription } = parse(staffPushSchema, req.body);
    const { error } = await req.auth.db.rpc('save_staff_push', {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh,
      p_auth: subscription.keys.auth,
      p_user_agent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
    });
    if (error) throw fromSupabase(error, 'Could not turn on alerts');
    res.status(201).json({ ok: true });
  }),
);

// POST /api/admin/push/unsubscribe { endpoint }
pushRouter.post(
  '/unsubscribe',
  staffHandler(async (req, res) => {
    const { endpoint } = parse(pushEndpointSchema, req.body);
    const { error } = await req.auth.db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.json({ ok: true });
  }),
);

// POST /api/admin/push/test → a test alert to every device of this staff member
pushRouter.post(
  '/test',
  staffHandler(async (req, res) => {
    if (!pushEnabled) throw badRequest('Notifications are not set up on this server yet.');
    const { data, error } = await req.auth.db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('kind', 'staff')
      .eq('staff_id', req.auth.staff.id);
    if (error) throw fromSupabase(error);
    const targets = (data ?? []) as PushTarget[];
    if (targets.length === 0) throw badRequest('Turn on alerts on this device first.');
    const delivered = await sendPush(
      targets,
      {
        title: 'Alerts are on',
        body: `This device will ring for new orders and waiter calls at ${req.auth.restaurant.name}.`,
        url: '/admin/orders',
        tag: 'staff-test',
        kind: 'test',
        renotify: true,
      },
      (endpoint) => req.auth.db.from('push_subscriptions').delete().eq('endpoint', endpoint),
    );
    res.json({ devices: targets.length, delivered });
  }),
);
