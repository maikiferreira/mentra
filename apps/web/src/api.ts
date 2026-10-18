const API_BASE =
  (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  'http://localhost:3000/api/v1';

export type {
  AuthUserDto as AuthUser,
  SessionDto as Session,
  PatientSummaryDto as PatientSummary,
  PatientDto as Patient,
  EvaluationSummaryDto as Evaluation,
  FichaDetailDto as FichaDetail,
  SuggestionDto as Suggestion,
  RoutineItemDto as RoutineItem,
  InstrumentEvolutionDto as InstrumentEvolution,
  EvolutionDto as Evolution,
  DashboardDto as Dashboard,
} from '@mente-ativa/shared';

export interface ApiError extends Error {
  status: number;
  code?: string;
  field?: string;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw Object.assign(new Error('Não foi possível conectar à API.'), { status: 0 });
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; field?: string };
  };
  if (!response.ok) {
    throw Object.assign(new Error(payload.error?.message ?? 'Ocorreu um erro inesperado.'), {
      status: response.status,
      code: payload.error?.code,
      field: payload.error?.field,
    }) as ApiError;
  }
  return payload as T;
}

export const jsonBody = (value: unknown): string => JSON.stringify(value);
