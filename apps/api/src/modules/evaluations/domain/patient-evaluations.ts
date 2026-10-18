import {
  INSTRUMENTS,
  evaluateInstrument,
  generatePatientSuggestions,
  instrumentOf,
  instrumentTrend,
  patientOverview,
  type InstrumentDefinition,
  type InstrumentKey,
  type InstrumentScores,
  type StoredEvaluation,
} from '@mente-ativa/shared';

interface EvaluationLike {
  id: string;
  instrument?: string | null;
  performedOn: Date;
  scores: unknown;
  notes?: string | null;
  createdAt?: Date | null;
}

interface PatientLike {
  code: string;
  educationYears?: number | null;
  evaluations: EvaluationLike[];
}

export interface PatientEvaluation extends StoredEvaluation {
  id: string;
  instrument: InstrumentKey;
  /** Data da avaliação em `aaaa-mm-dd`. */
  dateISO: string;
  notes: string | null;
  createdAt: Date;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Data de hoje em America/Sao_Paulo no formato aaaa-mm-dd. */
export function todayISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Datas de avaliação são dias de calendário, guardados à meia-noite UTC. */
export function toDateISO(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function toDateBR(date: Date) {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Avaliações do paciente em ordem cronológica (data da avaliação e, no empate, cadastro). */
export function storedEvaluations(patient: PatientLike): PatientEvaluation[] {
  return patient.evaluations
    .map((entry) => ({
      id: entry.id,
      date: toDateBR(entry.performedOn),
      dateISO: toDateISO(entry.performedOn),
      instrument: instrumentOf(entry),
      scores: entry.scores as InstrumentScores,
      notes: entry.notes ?? null,
      createdAt: entry.createdAt ?? entry.performedOn,
    }))
    .sort(
      (left, right) =>
        left.dateISO.localeCompare(right.dateISO) ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );
}

/** Avaliação cadastrada por último (não necessariamente a de data mais recente). */
export function lastRegistered(patient: PatientLike) {
  return storedEvaluations(patient).reduce<PatientEvaluation | undefined>(
    (latest, entry) =>
      !latest || entry.createdAt.getTime() >= latest.createdAt.getTime() ? entry : latest,
    undefined,
  );
}

export const contextOf = (patient: PatientLike) => ({
  educationYears: patient.educationYears ?? null,
});

export function evaluationsOf(patient: PatientLike, definition: InstrumentDefinition) {
  return storedEvaluations(patient).filter((entry) => entry.instrument === definition.key);
}

export function patientSuggestions(patient: PatientLike) {
  return generatePatientSuggestions({
    id: patient.code,
    evaluations: storedEvaluations(patient),
    educationYears: patient.educationYears ?? null,
  });
}

/** Resultado e tendência mais recentes de cada teste aplicado ao paciente. */
export function latestResults(patient: PatientLike) {
  return INSTRUMENTS.flatMap((definition) => {
    const evaluations = evaluationsOf(patient, definition);
    const last = evaluations.at(-1);
    if (!last) return [];
    const totals = evaluations.map((entry) => definition.score(entry.scores));
    return [
      {
        definition,
        date: last.date,
        result: evaluateInstrument(definition, last.scores, contextOf(patient)),
        trend: instrumentTrend(totals, definition.higherIsBetter),
      },
    ];
  });
}

/** Visão integrada: resultados por área, alertas cruzados e agenda de reavaliação. */
export function overviewOf(patient: PatientLike, today = todayISO()) {
  return patientOverview(storedEvaluations(patient), contextOf(patient), today);
}
