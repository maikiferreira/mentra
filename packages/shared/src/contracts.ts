// Contrato da API REST v1: formatos de resposta usados pela API e pelo front.
// Os serviços da API declaram que devolvem estes tipos, e o front os consome.
import type {
  InstrumentCategory,
  InstrumentKey,
  InstrumentResult,
  InstrumentScores,
  TrendResult,
} from './instruments.js';
import type { RoutineWeek } from './routine.js';

export interface AuthUserDto {
  username: string;
  name: string;
  role: 'admin' | 'professional';
}
export interface SessionDto {
  token: string;
  user: AuthUserDto;
}
export interface PatientSummaryDto {
  id: string;
  /** Nome completo; vazio em pacientes cadastrados só com as iniciais. */
  name: string;
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
export interface PatientDto {
  id: string;
  /** Nome completo; vazio em pacientes cadastrados só com as iniciais. */
  name: string;
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
export interface EvaluationSummaryDto {
  id: string;
  date: string;
  /** Data da avaliação em `aaaa-mm-dd`. */
  dateISO: string;
  instrument: InstrumentKey;
  instrumentName: string;
  total: number;
  max: number | null;
  level: InstrumentResult['level'];
  interpretation: string;
  status: string;
}
export interface FichaDetailDto extends EvaluationSummaryDto {
  scores: InstrumentScores;
  observations: string;
}
export interface SuggestionDto {
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
export interface RoutineItemDto {
  key: string;
  instrument: InstrumentKey;
  title: string;
  text: string;
  duration: string;
  frequency: string;
  /** Semanas acompanhadas (segunda-feira, aaaa-mm-dd), da mais antiga para a atual. */
  weeks: RoutineWeek[];
  /** Semanas feitas ÷ semanas acompanhadas (0 a 1). */
  adherence: number;
}
export interface InstrumentEvolutionDto {
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
export interface EvolutionDto {
  instruments: InstrumentEvolutionDto[];
  latestInstrument: InstrumentKey | null;
  suggestions: SuggestionDto[];
  routine: RoutineItemDto[];
}
export interface DashboardDto {
  greetingName: string;
  kpis: {
    patients: number;
    professionals?: number;
    recentDrops: number;
    routineActivities: number;
  };
  todo: Array<{
    patientId: string;
    /** Nome completo; vazio em pacientes cadastrados só com as iniciais. */
    name: string;
    initials: string;
    age: number;
    kind: string;
    text: string;
    tag: string;
    tagStyle: string;
    button: string;
    targetTab: 'fichas' | 'evolucao' | 'visao-geral';
  }>;
}
export interface PatientListDto {
  items: PatientSummaryDto[];
}
export interface FichaListDto {
  evaluations: EvaluationSummaryDto[];
}
/** Resposta ao criar ou editar uma ficha. */
export interface FichaSavedDto {
  evaluation: {
    id: string;
    date: string;
    instrument: InstrumentKey;
    total: number;
    max: number | null;
    level: InstrumentResult['level'];
    interpretation: string;
  };
}
export interface RoutinesDto {
  items: Array<{
    patientId: string;
    name: string;
    initials: string;
    age: number;
    activities: RoutineItemDto[];
  }>;
}
export interface RoutineWeekDto {
  key: string;
  weeks: RoutineWeek[];
  adherence: number;
}
export interface UsersDto {
  items: Array<{
    username: string;
    name: string;
    role: AuthUserDto['role'];
    patientCount: number;
  }>;
}
export interface LeadsDto {
  items: Array<{
    name: string;
    phone: string;
    email: string;
    profile: string;
    workplace: string;
    username: string;
    createdAt: string;
  }>;
}
