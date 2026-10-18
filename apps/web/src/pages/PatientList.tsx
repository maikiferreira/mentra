import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PatientListDto } from '@mente-ativa/shared';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client } from '../lib/client';
import { TONE_CHIP, scoreText } from '../lib/format';

export function PatientList() {
  const session = useUIStore((state) => state.session)!;
  const query = useQuery({
    queryKey: ['patients', session.user.username],
    queryFn: () => client<PatientListDto>('/patients'),
  });
  const items = query.data?.items ?? [];
  return (
    <>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorNote error={query.error} />
      ) : (
        <>
          <div className="head">
            <div className="head-row">
              <h1>Pacientes</h1>
              <Link className="btn primary" to="/pacientes/novo">
                Novo paciente
              </Link>
            </div>
            <p className="muted">Identificados só por código e iniciais.</p>
          </div>
          <div className="plist">
            {items.length ? (
              items.map((patient) => (
                <Link className="prow" key={patient.id} to={`/pacientes/${patient.id}`}>
                  <span className="code">{patient.id}</span>
                  <span className="pmeta">
                    <b>
                      {patient.initials}, {patient.age} anos
                    </b>
                    <span className="muted">
                      {patient.group}
                      {session.user.role === 'admin'
                        ? ` · Responsável: ${patient.responsibleName ?? patient.responsibleUsername}`
                        : ''}{' '}
                      ·{' '}
                      {patient.lastEvaluationDate
                        ? `última avaliação ${patient.lastEvaluationDate}`
                        : 'aguardando a primeira ficha'}
                    </span>
                  </span>
                  <span className="score">
                    {patient.lastResult
                      ? `${patient.lastResult.instrumentName} ${scoreText(patient.lastResult.total, patient.lastResult.max)}`
                      : '—'}
                  </span>
                  <span className="tr">
                    <span className={`chip ${TONE_CHIP[patient.trend.tone]}`}>
                      {patient.trend.label}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="drop" style={{ border: 0 }}>
                <h3>Nenhum paciente cadastrado</h3>
                <p className="muted">
                  Cadastre o primeiro paciente para enviar fichas e acompanhar a evolução.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
