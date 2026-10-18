import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldPoints, getInstrument, type InstrumentField } from '@mente-ativa/shared';
import type { FichaDetail, Patient } from '../../../api';
import { ErrorNote, Loading } from '../../../components/Feedback';
import { client } from '../../../lib/client';
import { LEVEL_CHIP, formatScore, scoreText } from '../../../lib/format';
import { InstrumentForm } from './NewFicha';

function answerText(field: InstrumentField, value: number | undefined) {
  if (value === undefined) return '—';
  if (field.kind === 'number')
    return field.max === undefined ? formatScore(value) : `${value}/${field.max}`;
  if (field.kind === 'check') return value === 1 ? 'Sim' : 'Não';
  const option = field.options?.find((entry) => entry.value === value);
  if (!option) return formatScore(value);
  return option.description ? `${option.label} — ${option.description}` : option.label;
}

/** Ficha salva: respostas item a item, observações, edição e exclusão. */
export function FichaPanel({
  patient,
  id,
  fichaId,
  onClose,
  onNotice,
}: {
  patient: Patient;
  id: string;
  fichaId: string;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({
    queryKey: ['ficha', id, fichaId],
    queryFn: () => client<FichaDetail>(`/patients/${id}/fichas/${fichaId}`),
  });
  const deletion = useMutation({
    mutationFn: () => client(`/patients/${id}/fichas/${fichaId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all(
        ['fichas', 'patient', 'evolution', 'overview'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key, id] }),
        ),
      );
      await Promise.all(
        ['patients', 'dashboard', 'routines'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onNotice(`Ficha de ${query.data?.date ?? ''} excluída. A evolução foi recalculada.`);
      onClose();
    },
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const ficha = query.data!;
  const definition = getInstrument(ficha.instrument)!;
  if (editing)
    return (
      <InstrumentForm
        definition={definition}
        patient={patient}
        id={id}
        editing={ficha}
        onCancel={() => setEditing(false)}
        onSaved={(date) => {
          setEditing(false);
          onNotice(`Ficha de ${date} atualizada. A evolução e as sugestões foram recalculadas.`);
        }}
      />
    );
  // Mesma organização do formulário: blocos por seção quando a seção tem vários itens.
  const sections = definition.sections
    .map((section) => ({
      ...section,
      fields: definition.fields.filter((field) => field.section === section.key),
    }))
    .filter((section) => section.fields.length);
  const loose = definition.fields.filter(
    (field) => !definition.sections.some((section) => section.key === field.section),
  );
  const groups = [
    ...sections,
    ...(loose.length ? [{ key: 'extra', name: 'Outros', fields: loose }] : []),
  ];
  return (
    <div className="panel">
      <div className="head-row">
        <h2>
          Ficha · {definition.shortName} · {ficha.date}
        </h2>
        <button className="btn small" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="muted">{definition.name}</p>
      <div
        className={`note ${LEVEL_CHIP[ficha.level] === 'up' ? 'ok' : ficha.level === 'info' ? '' : 'warn'}`}
        style={{ margin: '12px 0' }}
      >
        <b>
          {definition.totalLabel}: {scoreText(ficha.total, ficha.max)}
        </b>{' '}
        · {ficha.interpretation}
      </div>
      <div className="tblwrap">
        <table className="answers">
          <thead>
            <tr>
              <th>Item</th>
              <th>Resposta</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              {groups.length > 1 && group.fields.length > 1 && (
                <tr className="group">
                  <th colSpan={2}>{group.name}</th>
                </tr>
              )}
              {group.fields.map((field) => {
                const value = ficha.scores[field.key];
                const scored = field.scoredValue !== undefined && value !== undefined;
                return (
                  <tr key={field.key}>
                    <td>{field.label}</td>
                    <td>
                      {answerText(field, value)}
                      {scored && fieldPoints(field, value) === 1 && (
                        <span className="chip warn" style={{ marginLeft: 8 }}>
                          pontua
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <div className="obs" style={{ marginTop: 14 }}>
        <b>Observações</b>
        <p className={ficha.observations ? '' : 'muted'}>
          {ficha.observations || 'Nenhuma observação registrada.'}
        </p>
      </div>
      <ErrorNote error={deletion.error} />
      {confirmDelete ? (
        <div className="note warn" style={{ marginTop: 14 }}>
          <p style={{ marginBottom: 10 }}>
            Excluir a ficha de {definition.shortName} de {ficha.date}? A evolução e as sugestões
            serão recalculadas sem ela.
          </p>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              Sim, excluir ficha
            </button>
            <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn primary" type="button" onClick={() => setEditing(true)}>
            Editar ficha
          </button>
          <button className="btn" type="button" onClick={() => setConfirmDelete(true)}>
            Excluir ficha
          </button>
        </div>
      )}
    </div>
  );
}
