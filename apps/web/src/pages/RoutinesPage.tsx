import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { patientDisplayName, getInstrument, type RoutinesDto } from '@mente-ativa/shared';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client } from '../lib/client';
import { RoutineTracker } from '../components/RoutineTracker';

export function RoutinesPage() {
  const session = useUIStore((state) => state.session)!;
  const query = useQuery({
    queryKey: ['routines', session.user.username],
    queryFn: () => client<RoutinesDto>('/routines'),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const items = query.data!.items;
  return (
    <>
      <div className="head">
        <h1>Rotinas</h1>
        <p className="muted">
          Atividades aceitas pelo profissional, por paciente. Marque as atividades feitas a cada
          semana para acompanhar a adesão e imprima a rotina para o cuidador.
        </p>
      </div>
      {items.length ? (
        <div className="stack">
          {items.map((patient) => (
            <div className="panel" key={patient.patientId}>
              <div className="head-row">
                <h2>
                  {patient.patientId} · {patientDisplayName(patient)}, {patient.age} anos
                </h2>
                <span className="actions">
                  <Link className="btn small" to={`/pacientes/${patient.patientId}/rotina`}>
                    Imprimir rotina
                  </Link>
                  <Link className="btn small" to={`/pacientes/${patient.patientId}/evolucao`}>
                    Abrir paciente
                  </Link>
                </span>
              </div>
              <ul className="routine" style={{ marginTop: 8 }}>
                {patient.activities.map((activity) => (
                  <li key={activity.key}>
                    <span>
                      <b>{activity.title}</b>{' '}
                      <span className="chip">{getInstrument(activity.instrument)?.shortName}</span>
                      <br />
                      <span className="muted">{activity.text}</span>
                      <RoutineTracker patientId={patient.patientId} item={activity} />
                    </span>
                    <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {activity.duration} · {activity.frequency}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel">
          <p className="muted">
            Nenhuma atividade aceita ainda. Abra um paciente, envie uma ficha e aceite as sugestões
            para montar a rotina.
          </p>
        </div>
      )}
    </>
  );
}
