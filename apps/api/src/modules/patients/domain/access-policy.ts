import type { AuthUser } from '../../shared/presentation/http.js';

export function canAccessPatient(user: AuthUser, responsibleUsername: string): boolean {
  return user.role === 'admin' || user.username === responsibleUsername;
}
