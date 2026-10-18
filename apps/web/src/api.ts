import type { MeemDomainKey, MeemScores } from '@mentra/shared';

const API_BASE =
  (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  'http://localhost:3000/api/v1';

export interface AuthUser {
  username: string;
  name: string;
  role: 'admin' | 'professional';
}
export interface Session {
  token: string;
  user: AuthUser;
}
export interface PatientSummary {
  id: string;
  initials: string;
  age: number;
  group: string;
  responsibleUsername: string;
  responsibleName?: string;
  lastEvaluationDate: string | null;
  lastTotal: number | null;
  trend: { kind: string; label: string; delta: number | null };
  hasPending: boolean;
}
export interface Patient {
  id: string;
  initials: string;
  age: number;
  educationYears: number | null;
  interests: string;
  phone: string;
  address: string;
  emergencyContact: { name: string; phone: string; relationship: string };
  vision: string;
  hearing: string;
  mobility: string;
  group: string;
  objective: string;
  responsibleUsername: string;
  responsibleName: string;
  hasPending: boolean;
  evaluationCount: number;
}
export interface Evaluation {
  date: string;
  instrument: string;
  total: number;
  status: string;
}
export interface PendingFicha {
  date: string;
  scores: MeemScores;
  writtenTotal: number;
  flag: MeemDomainKey | null;
  observations: string;
  sheetLines: Array<{
    id: string;
    title?: string;
    left?: string;
    right?: string;
  }>;
}
export interface Suggestion {
  key: string;
  title: string;
  defaultText: string;
  duration: string;
  frequency: string;
  why: string;
  sources: string[];
  fell: boolean;
  lastDate: string | null;
  interests: string;
  state: { status: 'open' | 'ok' | 'no'; customText: string | null };
}
export interface Evolution {
  hasPending: boolean;
  pendingDate: string | null;
  suggestions: Suggestion[];
  routine: Array<{ key: string; title: string; text: string; duration: string; frequency: string }>;
  series?: Array<{ date: string; total: number }>;
  delta?: {
    previousDate: string;
    lastDate: string;
    rows: Array<{
      domain: MeemDomainKey;
      name: string;
      previous: number;
      last: number;
      max: number;
      kind: 'up' | 'down' | 'same';
      label: string;
    }>;
  };
  trend: { kind: string; label: string; delta: number | null };
}
export interface Dashboard {
  greetingName: string;
  kpis: {
    patients: number;
    professionals?: number;
    pendingFichas: number;
    recentDrops: number;
    routineActivities: number;
  };
  todo: Array<{
    patientId: string;
    initials: string;
    age: number;
    kind: string;
    text: string;
    tag: string;
    tagStyle: string;
    button: string;
    targetTab: 'fichas' | 'evolucao';
  }>;
}
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
