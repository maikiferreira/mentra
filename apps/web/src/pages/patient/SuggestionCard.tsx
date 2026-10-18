import { type Patient, type Suggestion } from '../../api';
import { shortDate } from '../../lib/client';

export function SuggestionCard({
  suggestion: s,
  patient,
  freshDate,
  editing,
  editText,
  setEditText,
  startEdit,
  cancelEdit,
  saveEdit,
  onStatus,
}: {
  suggestion: Suggestion;
  patient: Patient;
  freshDate: string | undefined;
  editing: boolean;
  editText: string;
  setEditText: (value: string) => void;
  startEdit: () => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  onStatus: (status: 'open' | 'ok' | 'no') => void;
}) {
  const state = s.state;
  const text = state.customText ?? s.defaultText;
  const fresh = Boolean(s.fell && s.lastDate && freshDate === s.lastDate);
  return (
    <div className={`sug ${state.status === 'ok' ? 'ok' : state.status === 'no' ? 'no' : ''}`}>
      <div className="row">
        <h3>{s.title}</h3>
        {fresh && <span className="chip acc">Nova com a ficha de {shortDate(s.lastDate!)}</span>}
        {state.status === 'ok' && <span className="chip up">Na rotina</span>}
        {state.status === 'no' && <span className="chip">Recusada</span>}
      </div>
      {state.status === 'no' ? (
        <div className="actions">
          <button className="btn small" onClick={() => onStatus('open')}>
            Desfazer
          </button>
        </div>
      ) : editing ? (
        <>
          <div className="edit">
            <label className="muted" htmlFor={`edit-${s.key}`}>
              Ajuste a atividade
            </label>
            <textarea
              id={`edit-${s.key}`}
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn primary small" onClick={saveEdit}>
              Salvar
            </button>
            <button className="btn small" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{text}</p>
          <p className="muted">
            {s.duration} · {s.frequency}
          </p>
          {patient.interests && (
            <p className="muted">Para personalizar (perfil do paciente): {patient.interests}</p>
          )}
          <div className="why">
            <b>Por que esta sugestão:</b> {s.why}{' '}
            <span className="row" style={{ marginTop: 6 }}>
              Fonte:{' '}
              {s.sources.map((date) => (
                <span className="src" key={date}>
                  avaliação {date}
                </span>
              ))}
            </span>
          </div>
          <div className="actions">
            {state.status === 'ok' ? (
              <button className="btn small" onClick={() => onStatus('open')}>
                Tirar da rotina
              </button>
            ) : (
              <button className="btn primary small" onClick={() => onStatus('ok')}>
                Aceitar
              </button>
            )}
            <button className="btn small" onClick={startEdit}>
              Editar
            </button>
            {state.status !== 'ok' && (
              <button className="btn small" onClick={() => onStatus('no')}>
                Recusar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
