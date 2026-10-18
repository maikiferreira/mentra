import { Router } from 'express';
import { AuthService } from '../application/auth-service.js';
import { AdminQueryService } from '../application/admin-query-service.js';
import { getRequestUser, requireAdmin, requireAuth } from '../../shared/presentation/http.js';
import { resetDemoDatabase } from '../application/demo-reset-service.js';

const auth = new AuthService();
const adminQueries = new AdminQueryService();
export const authRouter = Router();
authRouter.post('/login', async (request, response) =>
  response.json(await auth.login(request.body)),
);
authRouter.post('/signup', async (request, response) =>
  response.status(201).json(await auth.signup(request.body)),
);
authRouter.post('/trial-access', async (request, response) =>
  response.status(201).json(await auth.trialAccess(request.body)),
);
authRouter.get('/me', requireAuth, async (request, response) =>
  response.json(await auth.me(getRequestUser(request).username)),
);

export const adminRouter = Router();
adminRouter.get('/users', requireAuth, requireAdmin, async (_request, response) =>
  response.json(await adminQueries.users()),
);
adminRouter.get('/leads', requireAuth, requireAdmin, async (_request, response) =>
  response.json(await adminQueries.leads()),
);
adminRouter.post(
  '/demo/reset',
  (_request, response, next) => {
    if (process.env.NODE_ENV === 'production') {
      return response
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } });
    }
    return next();
  },
  requireAuth,
  requireAdmin,
  async (_request, response) => {
    await resetDemoDatabase();
    response.status(204).end();
  },
);
