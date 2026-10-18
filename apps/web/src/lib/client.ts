import { api } from '../api';
import { useUIStore } from '../ui-store';

export const client = <T>(path: string, options?: RequestInit): Promise<T> =>
  api<T>(path, options, useUIStore.getState().session?.token);

export const dateBR = () =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export const shortDate = (date: string) => date.split(' ')[0];

export const errorMessage = (error: unknown) =>
  typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : 'Ocorreu um erro inesperado.';
