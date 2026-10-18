// Visão integrada do paciente: último resultado de cada teste por área, alertas que cruzam
// as áreas (e-book, cap. 11 "Integração dos resultados") e agenda de reavaliação.
import {
  INSTRUMENTS,
  INSTRUMENT_CATEGORIES,
  evaluateInstrument,
  instrumentOf,
  instrumentTrend,
  type InstrumentCategory,
  type InstrumentKey,
  type InstrumentResult,
  type InstrumentScores,
  type TrendResult,
} from './instruments.js';

/** Meses até reaplicar o teste: resultado dentro do esperado ou que pede atenção. */
export const REASSESSMENT_MONTHS = { ok: 6, attention: 3 } as const;

export interface OverviewEvaluation {
  /** Data da avaliação em `aaaa-mm-dd`. */
  dateISO: string;
  /** Data para exibição (`dd/mm/aaaa`). */
  date: string;
  instrument?: string | null;
  scores: InstrumentScores;
  notes?: string | null;
}

export interface InstrumentStatus {
  key: InstrumentKey;
  name: string;
  shortName: string;
  latest:
    (InstrumentResult & { date: string; dateISO: string; observations: string | null }) | null;
  trend: TrendResult;
  /** Próxima reavaliação (`aaaa-mm-dd`); nulo quando o teste nunca foi aplicado. */
  nextDue: string | null;
  overdue: boolean;
}

export interface CrossAlert {
  key: string;
  level: 'attention' | 'info';
  title: string;
  text: string;
  instruments: InstrumentKey[];
}

export interface PatientOverview {
  categories: Array<{ key: InstrumentCategory; name: string; instruments: InstrumentStatus[] }>;
  alerts: CrossAlert[];
}

/** Soma meses a uma data `aaaa-mm-dd`, ajustando para o último dia do mês quando preciso. */
export function addMonths(dateISO: string, months: number): string {
  const [year, month, day] = dateISO.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

const altered = (status: InstrumentStatus | undefined) =>
  Boolean(
    status?.latest && (status.latest.level === 'attention' || status.latest.level === 'alert'),
  );

function names(statuses: InstrumentStatus[]) {
  const list = statuses.map((status) => status.shortName);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list.at(-1)}` : (list[0] ?? '');
}

function crossAlerts(byKey: Map<InstrumentKey, InstrumentStatus>): CrossAlert[] {
  const of = (category: InstrumentCategory) =>
    INSTRUMENTS.filter((entry) => entry.category === category).map((entry) =>
      byKey.get(entry.key)!,
    );
  const cognition = of('cognicao');
  const mood = of('humor');
  const functional = of('funcionalidade');
  const alteredCognition = cognition.filter(altered);
  const alteredMood = mood.filter(altered);
  const alteredFunctional = functional.filter(altered);
  const applied = (statuses: InstrumentStatus[]) => statuses.some((status) => status.latest);
  const alerts: CrossAlert[] = [];

  if (alteredMood.length && alteredCognition.length)
    alerts.push({
      key: 'humor-cognicao',
      level: 'attention',
      title: 'Humor alterado junto com a cognição',
      text: `${names(alteredMood)} indica sintomas que podem estar piorando o desempenho em ${names(alteredCognition)}. Vale cuidar do humor e reavaliar a cognição depois.`,
      instruments: [...alteredMood, ...alteredCognition].map((status) => status.key),
    });
  if (alteredCognition.length && alteredFunctional.length) {
    const cdr = byKey.get('cdr')!;
    alerts.push({
      key: 'cognicao-funcionalidade',
      level: 'attention',
      title: 'Alteração cognitiva com impacto nas atividades diárias',
      text: `Há resultados alterados em ${names([...alteredCognition, ...alteredFunctional])}. ${
        cdr.latest
          ? 'Acompanhe a CDR para estimar a gravidade e compartilhe os resultados com a equipe de saúde.'
          : 'Considere aplicar a CDR para estimar a gravidade e compartilhe os resultados com a equipe de saúde.'
      }`,
      instruments: [...alteredCognition, ...alteredFunctional].map((status) => status.key),
    });
  }
  if (alteredCognition.length && !applied(mood))
    alerts.push({
      key: 'avaliar-humor',
      level: 'info',
      title: 'Humor ainda não avaliado',
      text: `Com resultado alterado em ${names(alteredCognition)}, aplique a GDS-15 e o Inventário de Ansiedade: depressão e ansiedade podem afetar o desempenho cognitivo.`,
      instruments: alteredCognition.map((status) => status.key),
    });
  if (alteredCognition.length && !applied(functional))
    alerts.push({
      key: 'avaliar-funcionalidade',
      level: 'info',
      title: 'Funcionalidade ainda não avaliada',
      text: `Com resultado alterado em ${names(alteredCognition)}, aplique o Pfeffer e o Katz para verificar o impacto nas atividades do dia a dia.`,
      instruments: alteredCognition.map((status) => status.key),
    });
  const pfeffer = byKey.get('pfeffer')!;
  const katz = byKey.get('katz')!;
  if (altered(pfeffer) && katz.latest?.level === 'ok')
    alerts.push({
      key: 'instrumentais-executivas',
      level: 'attention',
      title: 'Atividades instrumentais comprometidas, básicas preservadas',
      text: 'O Pfeffer indica dependência enquanto o Katz mostra independência nas atividades básicas: as funções executivas podem estar prejudicadas.',
      instruments: ['pfeffer', 'katz'],
    });
  return alerts;
}

/** Monta a visão integrada a partir das fichas do paciente (`today` em `aaaa-mm-dd`). */
export function patientOverview(
  evaluations: OverviewEvaluation[],
  context: { educationYears: number | null },
  today: string,
): PatientOverview {
  const byKey = new Map<InstrumentKey, InstrumentStatus>();
  for (const definition of INSTRUMENTS) {
    const own = evaluations
      .filter((entry) => instrumentOf(entry) === definition.key)
      .sort((left, right) => left.dateISO.localeCompare(right.dateISO));
    const last = own.at(-1);
    const latest = last
      ? {
          ...evaluateInstrument(definition, last.scores, context),
          date: last.date,
          dateISO: last.dateISO,
          observations: last.notes ?? null,
        }
      : null;
    const nextDue = latest
      ? addMonths(
          latest.dateISO,
          latest.level === 'ok' || latest.level === 'info'
            ? REASSESSMENT_MONTHS.ok
            : REASSESSMENT_MONTHS.attention,
        )
      : null;
    byKey.set(definition.key, {
      key: definition.key,
      name: definition.name,
      shortName: definition.shortName,
      latest,
      trend: instrumentTrend(
        own.map((entry) => definition.score(entry.scores)),
        definition.higherIsBetter,
      ),
      nextDue,
      overdue: nextDue !== null && nextDue < today,
    });
  }
  return {
    categories: INSTRUMENT_CATEGORIES.map((category) => ({
      ...category,
      instruments: INSTRUMENTS.filter((entry) => entry.category === category.key).map((entry) =>
        byKey.get(entry.key)!,
      ),
    })),
    alerts: crossAlerts(byKey),
  };
}
