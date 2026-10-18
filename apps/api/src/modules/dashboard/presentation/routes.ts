import { Router } from 'express';
import { DashboardService } from '../application/dashboard-service.js';
import { getRequestUser, requireAuth } from '../../shared/presentation/http.js';

const dashboard = new DashboardService();
export const dashboardRouter = Router();
dashboardRouter.get('/summary', requireAuth, async (request, response) =>
  response.json(await dashboard.summary(getRequestUser(request))),
);
