import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { FichaListDto, InstrumentKey } from '@mente-ativa/shared';
import { useUIStore } from '../../ui-store';
import { ErrorNote, Loading } from '../../components/Feedback';
import { client, shortDate } from '../../lib/client';
import { LEVEL_CHIP, LEVEL_NAME, scoreText } from '../../lib/format';
import { usePatientContext } from './context';
import { FichaPanel } from './fichas/FichaPanel';
import { NewFicha } from './fichas/NewFicha';

export function PatientFichas() {
  const { id, patient } = usePatientContext();
  // Vindo da visão geral ("Registrar MoCA"), o formulário já abre no teste escolhido.
  const requested = (useLocation().state as { newInstrument?: InstrumentKey } | null)
    ?.newInstrument;
  const [formOpen, setFormOpen] = useState(Boolean(requested));
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const justRegistered = useUIStore((state) => state.justRegistered[id]);
  const fichasQuery = useQuery({
    queryKey: ['fichas', id],
    queryFn: () => client<FichaListDto>(`/patients/${id}/fichas`),
  });
  if (fichasQuery.isLoading) return <Loading />;
  if (fichasQuery.error) return <ErrorNote error={fichasQuery.error} />;
  const evaluations = fichasQuery.data?.evaluations ?? [];
  return (
    <div className="stack">
      {notice ? (
        <div className="note ok" role="status">
          {notice}
        </div>
      ) : (
        justRegistered && (
          <div className="note ok">
            Ficha de {shortDate(justRegistered)} registrada. A evolução e as sugestões foram
            atualizadas.
          </div>
        )
      )}
      <div className="panel">
        <h2>Fichas deste paciente</h2>
        {evaluations.length ? (
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Teste</th>
                  <th className="num">Resultado</th>
                  <th>Interpretação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.id} className={selected === evaluation.id ? 'sel' : ''}>
                    <td>{evaluation.date}</td>
                    <td>{evaluation.instrumentName}</td>
                    <td className="num">{scoreText(evaluation.total, evaluation.max)}</td>
                    <td>
                      <span className={`chip ${LEVEL_CHIP[evaluation.level]}`}>
                        {LEVEL_NAME[evaluation.level]}
                      </span>{' '}
                      <span className="muted interp">{evaluation.interpretation}</span>
                    </td>
                    <td>
                      <button
                        className="btn small"
                        type="button"
                        aria-label={`Ver ficha de ${evaluation.instrumentName} de ${evaluation.date}`}
                        onClick={() => {
                          setSelected(evaluation.id);
                          setFormOpen(false);
                          setNotice(null);
                        }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhuma ficha registrada ainda.</p>
        )}
      </div>
      {selected ? (
        <FichaPanel
          key={selected}
          patient={patient}
          id={id}
          fichaId={selected}
          onClose={() => setSelected(null)}
          onNotice={setNotice}
        />
      ) : formOpen ? (
        <NewFicha
          patient={patient}
          id={id}
          initialInstrument={requested}
          onCancel={() => setFormOpen(false)}
        />
      ) : (
        <div className="drop">
          <h3>Registrar nova ficha</h3>
          <p className="muted">
            Testes de cognição (MEEM, MoCA, Relógio, Fluência verbal), humor (GDS-15, Ansiedade
            geriátrica) e funcionalidade (Pfeffer, Katz, CDR).
          </p>
          <div>
            <button className="btn primary" onClick={() => setFormOpen(true)}>
              Registrar nova ficha
            </button>
          </div>
        </div>
      )}
      {evaluations.length > 0 && (
        <Link className="btn" to={`/pacientes/${id}/evolucao`}>
          Ver evolução e sugestões
        </Link>
      )}
    </div>
  );
}
