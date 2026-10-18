import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../kernel/errors.js';
import { UserModel } from '../infra/models.js';

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

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Autenticação necessária.'));
  try {
    const payload = jwt.verify(token, secret());
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      !['admin', 'professional'].includes(String(payload.role))
    ) {
      throw new Error('Invalid token payload');
    }
    const user = await UserModel.findOne(
      { username: payload.sub },
      { username: 1, name: 1, role: 1 },
    ).lean();
    if (!user) return next(new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.'));
    authenticatedUsers.set(request, {
      username: user.username,
      name: user.name,
      role: payload.role as AuthUser['role'],
    });
    return next();
  } catch {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.'));
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
