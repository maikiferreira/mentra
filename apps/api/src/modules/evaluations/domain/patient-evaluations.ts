import {
  INSTRUMENTS,
  evaluateInstrument,
  generatePatientSuggestions,
  instrumentOf,
  instrumentTrend,
  type InstrumentDefinition,
  type InstrumentScores,
  type StoredEvaluation,
} from '@mente-ativa/shared';

interface PatientLike {
  code: string;
  educationYears?: number | null;
  evaluations: Array<{ date: string; instrument?: string | null; scores: unknown }>;
}

export function storedEvaluations(patient: PatientLike): StoredEvaluation[] {
  return patient.evaluations.map((entry) => ({
    date: entry.date,
    instrument: instrumentOf(entry),
    scores: entry.scores as InstrumentScores,
  }));
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
