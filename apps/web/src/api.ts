import type {
  InstrumentCategory,
  InstrumentKey,
  InstrumentResult,
  PlanId,
  SubscriptionStatus,
  TrendResult,
} from '@mente-ativa/shared';

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
  lastResult: {
    instrument: InstrumentKey;
    instrumentName: string;
    total: number;
    max: number | null;
    level: InstrumentResult['level'];
  } | null;
  trend: TrendResult;
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
  evaluationCount: number;
}
export interface Evaluation {
  date: string;
  instrument: InstrumentKey;
  instrumentName: string;
  total: number;
  max: number | null;
  level: InstrumentResult['level'];
  interpretation: string;
  status: string;
}
export interface Suggestion {
  key: string;
  instrument: InstrumentKey;
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
export interface RoutineItem {
  key: string;
  instrument: InstrumentKey;
  title: string;
  text: string;
  duration: string;
  frequency: string;
}
export interface InstrumentEvolution {
  key: InstrumentKey;
  name: string;
  shortName: string;
  category: InstrumentCategory;
  max: number | null;
  higherIsBetter: boolean;
  totalLabel: string;
  series: Array<{ date: string; total: number }>;
  latest: InstrumentResult & { date: string };
  trend: TrendResult;
  delta?: {
    previousDate: string;
    lastDate: string;
    rows: Array<{
      key: string;
      name: string;
      previous: number;
      last: number;
      max: number | null;
      kind: 'up' | 'down' | 'same';
      tone: TrendResult['tone'];
      label: string;
    }>;
  };
}
export interface Evolution {
  instruments: InstrumentEvolution[];
  latestInstrument: InstrumentKey | null;
  suggestions: Suggestion[];
  routine: RoutineItem[];
}
export interface Dashboard {
  greetingName: string;
  kpis: {
    patients: number;
    professionals?: number;
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
export type AccessReason =
  | 'exempt'
  | 'trial'
  | 'active'
  | 'grace_period'
  | 'canceled_until_period_end'
  | 'trial_expired'
  | 'no_subscription'
  | 'past_due'
  | 'canceled'
  | 'incomplete';
export interface BillingPayment {
  id: string;
  amountCents: number;
  currency: string;
  plan: PlanId | null;
  status: 'paid' | 'failed' | 'refunded';
  paidAt: string | null;
  createdAt: string | null;
}
export interface BillingMe {
  hasAccess: boolean;
  reason: AccessReason;
  status: SubscriptionStatus | null;
  plan: PlanId | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  payments: BillingPayment[];
}

let subscriptionRequiredListener: (() => void) | null = null;
/** RN-PAY-05: chamado quando a API responde 402 SUBSCRIPTION_REQUIRED. */
export function onSubscriptionRequired(listener: (() => void) | null) {
  subscriptionRequiredListener = listener;
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
    if (response.status === 402 && payload.error?.code === 'SUBSCRIPTION_REQUIRED')
      subscriptionRequiredListener?.();
    throw Object.assign(new Error(payload.error?.message ?? 'Ocorreu um erro inesperado.'), {
      status: response.status,
      code: payload.error?.code,
      field: payload.error?.field,
    }) as ApiError;
  }
  return payload as T;
}

export const jsonBody = (value: unknown): string => JSON.stringify(value);
