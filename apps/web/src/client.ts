import { api } from './api';
import { useUIStore } from './ui-store';

/** Chamada autenticada com o token da sessão atual. */
export const client = <T>(path: string, options?: RequestInit): Promise<T> =>
  api<T>(path, options, useUIStore.getState().session?.token);
