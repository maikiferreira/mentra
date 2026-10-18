import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoutineItem } from '../api';
import { jsonBody } from '../api';
import { client } from '../lib/client';
import { isoToBR } from '../lib/format';
import { ErrorNote } from './Feedback';

/** Marcação "feita nesta semana" e histórico das últimas semanas de uma atividade da rotina. */
export function RoutineTracker({ patientId, item }: { patientId: string; item: RoutineItem }) {
  const queryClient = useQueryClient();
  const current = item.weeks.at(-1);
  const mark = useMutation({
    mutationFn: ({ week, done }: { week: string; done: boolean }) =>
      client(`/patients/${patientId}/routine/${encodeURIComponent(item.key)}/weeks/${week}`, {
        method: 'PUT',
        body: jsonBody({ done }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['routines'] }),
        queryClient.invalidateQueries({ queryKey: ['evolution', patientId] }),
      ]);
    },
  });
  if (!current) return null;
  return (
    <div className="tracker">
      <label className="fld-check">
        <input
          type="checkbox"
          checked={current.done}
          disabled={mark.isPending}
          onChange={(event) => mark.mutate({ week: current.week, done: event.target.checked })}
        />
        <span>Feita nesta semana</span>
      </label>
      <span className="weeks" aria-label="Semanas anteriores">
        {item.weeks.slice(0, -1).map((entry) => (
          <button
            type="button"
            key={entry.week}
            className={`wk ${entry.done ? 'on' : ''}`}
            aria-pressed={entry.done}
            title={`Semana de ${isoToBR(entry.week)}`}
            aria-label={`Semana de ${isoToBR(entry.week)}: ${entry.done ? 'feita' : 'não feita'}`}
            disabled={mark.isPending}
            onClick={() => mark.mutate({ week: entry.week, done: !entry.done })}
          />
        ))}
      </span>
      <span className="muted">
        Adesão: {Math.round(item.adherence * 100)}% (
        {item.weeks.filter((entry) => entry.done).length}/{item.weeks.length}{' '}
        {item.weeks.length === 1 ? 'semana' : 'semanas'})
      </span>
      <ErrorNote error={mark.error} />
    </div>
  );
}
