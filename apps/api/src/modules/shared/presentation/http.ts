import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SubscriptionStatus } from '@mente-ativa/shared';
import { ApiError, subscriptionRequired } from '../kernel/errors.js';
import { SubscriptionModel, UserModel } from '../infra/models.js';
import { hasActiveAccess, type AccessDecision } from '../../billing/domain/access-policy.js';

export interface AuthUser {
  username: string;
  name: string;
  role: 'admin' | 'professional';
}

const authenticatedUsers = new WeakMap<Request, AuthUser>();

export function getRequestUser(request: Request): AuthUser {
  const user = authenticatedUsers.get(request);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  return user;
}

const secret = () => process.env.JWT_SECRET ?? 'local-development-secret-change-me';
export function createToken(user: AuthUser) {
  return jwt.sign({ sub: user.username, role: user.role }, secret(), { expiresIn: '8h' });
}

export interface RequestAccess extends AccessDecision {
  trialEndsAt: string | null;
  status: SubscriptionStatus | null;
}
const requestAccess = new WeakMap<Request, RequestAccess>();

export function getRequestAccess(request: Request): RequestAccess {
  const access = requestAccess.get(request);
  if (!access) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  return access;
}

async function authenticate(request: Request, enforceSubscription: boolean) {
  const header = request.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, secret());
    if (
      typeof verified === 'string' ||
      typeof verified.sub !== 'string' ||
      !['admin', 'professional'].includes(String(verified.role))
    ) {
      throw new Error('Invalid token payload');
    }
    payload = verified;
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  }
  const [user, subscription] = await Promise.all([
    UserModel.findOne(
      { username: payload.sub },
      { username: 1, name: 1, role: 1, origin: 1, trialEndsAt: 1 },
    ).lean(),
    SubscriptionModel.findOne(
      { username: payload.sub },
      { status: 1, currentPeriodEnd: 1, pastDueSince: 1 },
    ).lean(),
  ]);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  // RN-PAY-05/06: o acesso é recalculado a cada requisição a partir do banco.
  const decision = hasActiveAccess(user, subscription, new Date());
  if (enforceSubscription && !decision.hasAccess) throw subscriptionRequired();
  authenticatedUsers.set(request, {
    username: user.username,
    name: user.name,
    role: payload.role as AuthUser['role'],
  });
  requestAccess.set(request, {
    ...decision,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    status: subscription?.status ?? null,
  });
}

/** Exige sessão válida e acesso (isento, trial ou assinatura); sem acesso responde 402. */
export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  try {
    await authenticate(request, true);
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Exige só a sessão: usado em /auth/me e /billing/*, que quem precisa assinar ainda acessa. */
export async function requireAuthAllowUnpaid(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  try {
    await authenticate(request, false);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (authenticatedUsers.get(request)?.role !== 'admin')
    return next(new ApiError(403, 'FORBIDDEN', 'Acesso permitido somente a administradores.'));
  return next();
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (error instanceof ApiError) {
    const detail = error.field ? { field: error.field } : {};
    response
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, ...detail } });
    return;
  }
  if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
    response
      .status(401)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' } });
    return;
  }
  console.error(error);
  response
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro interno.' } });
  void next;
};
