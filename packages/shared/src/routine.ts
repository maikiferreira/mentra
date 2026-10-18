// Acompanhamento da rotina: semanas começam na segunda-feira e são identificadas
// pela data dessa segunda (`aaaa-mm-dd`).

/** Semanas consideradas na adesão (a atual e as anteriores). */
export const ADHERENCE_WEEKS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira da semana de uma data `aaaa-mm-dd`. */
export function weekStart(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7; // segunda = 0
  return new Date(date.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

/** As últimas `count` semanas até a de `todayISO`, da mais antiga para a atual. */
export function recentWeeks(todayISO: string, count = ADHERENCE_WEEKS): string[] {
  const current = new Date(`${weekStart(todayISO)}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, index) =>
    new Date(current - (count - 1 - index) * 7 * DAY_MS).toISOString().slice(0, 10),
  );
}

export interface RoutineWeek {
  week: string;
  done: boolean;
}

/**
 * Semanas acompanhadas de uma atividade (desde a semana em que foi aceita) e a adesão:
 * semanas feitas ÷ semanas acompanhadas.
 */
export function routineAdherence(
  doneWeeks: string[],
  todayISO: string,
  acceptedOn: string | null,
): { weeks: RoutineWeek[]; adherence: number } {
  const since = acceptedOn ? weekStart(acceptedOn) : null;
  const weeks = recentWeeks(todayISO)
    .filter((week) => !since || week >= since)
    .map((week) => ({ week, done: doneWeeks.includes(week) }));
  const done = weeks.filter((entry) => entry.done).length;
  return { weeks, adherence: weeks.length ? done / weeks.length : 0 };
}
