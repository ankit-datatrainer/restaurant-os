import { Router, type NextFunction, type Request, type Response } from 'express';
import type { StaffSession } from '@restaurant-os/shared';
import { requireStaff } from '../../middleware/auth.js';
import { staffHandler } from '../../services/handlers.js';
import { stripRestaurant } from '../../services/restaurant.js';
import { buildDashboardStats } from '../../services/stats.js';
import { ordersRouter } from './orders.js';
import { billingRouter } from './billing.js';
import { callsRouter } from './calls.js';
import { menuRouter } from './menu.js';
import { tablesRouter } from './tables.js';
import { restaurantRouter } from './restaurant.js';
import { customersRouter } from './customers.js';
import { feedbackRouter } from './feedback.js';
import { loyaltyRouter } from './loyalty.js';
import { analyticsRouter } from './analytics.js';
import { integrationsRouter } from './integrations.js';
import { posRouter } from './pos.js';
import { reservationsRouter } from './reservations.js';
import { promotionsRouter } from './promotions.js';
import { inventoryRouter } from './inventory.js';
import { financeRouter } from './finance.js';
import { joinRouter, staffRouter } from './staff.js';
import { pushRouter } from './push.js';

/**
 * `<img src="/api/admin/tables/:id/qr.svg?token=…">` cannot send headers, so the
 * QR routes also accept the access token as a query parameter.
 */
function tokenFromQuery(req: Request, _res: Response, next: NextFunction) {
  const token = req.query.token;
  if (!req.headers.authorization && typeof token === 'string' && token.trim()) {
    req.headers.authorization = `Bearer ${token.trim()}`;
  }
  next();
}

export const adminRouter = Router();

adminRouter.get(['/tables/:id/qr.svg', '/tables/:id/qr.png', '/customers/export.csv', '/export.json', '/export/orders.csv'], tokenFromQuery);
// Joining with an invite code happens before the account has a staff row.
adminRouter.use(joinRouter);
adminRouter.use(requireStaff);

adminRouter.get(
  '/me',
  staffHandler(async (req, res) => {
    const session: StaffSession = { staff: req.auth.staff, restaurant: stripRestaurant(req.auth.restaurant) };
    res.json(session);
  }),
);

adminRouter.get(
  '/stats',
  staffHandler(async (req, res) => {
    res.json(await buildDashboardStats(req.auth.db, req.auth.restaurant.id));
  }),
);

adminRouter.use('/orders', ordersRouter);
adminRouter.use('/billing', billingRouter);
adminRouter.use('/calls', callsRouter);
adminRouter.use('/menu', menuRouter);
adminRouter.use('/tables', tablesRouter);
adminRouter.use('/restaurant', restaurantRouter);
adminRouter.use('/customers', customersRouter);
adminRouter.use('/feedback', feedbackRouter);
adminRouter.use('/loyalty', loyaltyRouter);
adminRouter.use('/analytics', analyticsRouter);
adminRouter.use('/', integrationsRouter);
adminRouter.use('/', posRouter);
adminRouter.use('/', reservationsRouter);
adminRouter.use('/', promotionsRouter);
adminRouter.use('/inventory', inventoryRouter);
adminRouter.use('/finance', financeRouter);
adminRouter.use('/', staffRouter);
adminRouter.use('/push', pushRouter);
