import { routineAdherence } from '@mente-ativa/shared';
import { patientSuggestions, todayISO } from '../../evaluations/domain/patient-evaluations.js';

type PatientWithRoutine = Parameters<typeof patientSuggestions>[0] & {
  suggestionStates: Array<{
    key: string;
    status: string;
    customText?: string | null | undefined;
    acceptedAt?: Date | null | undefined;
  }>;
  routineLog?: Array<{ key: string; week: string }> | null | undefined;
};

/** Atividades aceitas (rotina) com as semanas feitas e a adesão recente. */
export function routineItems(patient: PatientWithRoutine, today = todayISO()) {
  const states = new Map(patient.suggestionStates.map((state) => [state.key, state]));
  return patientSuggestions(patient)
    .filter((suggestion) => states.get(suggestion.key)?.status === 'ok')
    .map((suggestion) => {
      const state = states.get(suggestion.key)!;
      const doneWeeks = (patient.routineLog ?? [])
        .filter((entry) => entry.key === suggestion.key)
        .map((entry) => entry.week);
      const { weeks, adherence } = routineAdherence(
        doneWeeks,
        today,
        state.acceptedAt ? todayISO(state.acceptedAt) : null,
      );
      return {
        key: suggestion.key,
        instrument: suggestion.instrument,
        title: suggestion.activity.title,
        text: state.customText ?? suggestion.activity.text,
        duration: suggestion.activity.duration,
        frequency: suggestion.activity.frequency,
        weeks,
        adherence,
      };
    });
}
