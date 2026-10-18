import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInstrument } from '@mente-ativa/shared';
import { type Evolution } from '../api';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client } from '../lib/client';

export function RoutinesPage() {
  const session = useUIStore((state) => state.session)!;
  const query = useQuery({
    queryKey: ['routines', session.user.username],
    queryFn: () =>
      client<{
        items: Array<{
          patientId: string;
          initials: string;
          age: number;
          activities: Evolution['routine'];
        }>;
      }>('/routines'),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const items = query.data!.items;
  return (
    <>
      <div className="head">
        <h1>Rotinas</h1>
        <p className="muted">
          Atividades aceitas pelo profissional, por paciente. Aceite sugestões na aba Evolução e
          sugestões de cada paciente.
        </p>
      </div>
      {items.length ? (
        <div className="stack">
          {items.map((patient) => (
            <div className="panel" key={patient.patientId}>
              <div className="head-row">
                <h2>
                  {patient.patientId} · {patient.initials}, {patient.age} anos
                </h2>
                <Link className="btn small" to={`/pacientes/${patient.patientId}/evolucao`}>
                  Abrir paciente
                </Link>
              </div>
              <ul className="routine" style={{ marginTop: 8 }}>
                {patient.activities.map((activity) => (
                  <li key={activity.key}>
                    <span>
                      <b>{activity.title}</b>{' '}
                      <span className="chip">{getInstrument(activity.instrument)?.shortName}</span>
                      <br />
                      <span className="muted">{activity.text}</span>
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
