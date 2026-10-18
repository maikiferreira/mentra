import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type Dashboard } from '../api';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client, dateBR } from '../lib/client';

export function HomePage() {
  const session = useUIStore((state) => state.session)!;
  const query = useQuery({
    queryKey: ['dashboard', session.user.username],
    queryFn: () => client<Dashboard>('/dashboard/summary'),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const summary = query.data!;
  const kpi = summary.kpis;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return (
    <>
      <div className="head">
        <div className="head-row">
          <div>
            <h1>
              {greeting}, {summary.greetingName}
            </h1>
            <p className="muted">Resumo de hoje, {dateBR()}</p>
          </div>
          <div className="actions">
            <Link className="btn primary" to="/pacientes/novo">
              Novo paciente
            </Link>
            <Link className="btn" to="/pacientes">
              Ver pacientes
            </Link>
          </div>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <b>{kpi.patients}</b>
          <span>
            {session.user.role === 'admin' ? 'Pacientes no sistema' : 'Pacientes acompanhados'}
          </span>
        </div>
        {session.user.role === 'admin' && (
          <div className="kpi">
            <b>{kpi.professionals ?? 0}</b>
            <span>Profissionais cadastrados</span>
          </div>
        )}
        <div className={`kpi ${kpi.recentDrops ? 'warn' : ''}`}>
          <b>{kpi.recentDrops}</b>
          <span>Pacientes com queda recente</span>
        </div>
        <div className="kpi">
          <b>{kpi.routineActivities}</b>
          <span>Atividades na rotina</span>
        </div>
      </div>
      <div className="stack">
        <div>
          <h2 style={{ marginBottom: 12 }}>Para fazer hoje</h2>
          {summary.todo.length ? (
            <div className="plist">
              {summary.todo.map((item, index) => (
                <div className="arow" key={`${item.patientId}-${item.kind}-${index}`}>
                  <div className="t">
                    <b>
                      {item.patientId} · {item.initials}, {item.age} anos
                    </b>
                    <span className="muted">{item.text}</span>
                  </div>
                  <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      className={`chip ${item.tagStyle === 'warn' ? 'warn' : item.tagStyle === 'down' ? 'down' : ''}`}
                    >
                      {item.tag}
                    </span>
                    <Link
                      className="btn small"
                      to={`/pacientes/${item.patientId}${item.targetTab === 'fichas' ? '' : `/${item.targetTab}`}`}
                    >
                      {item.button}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <p className="muted">
                Nada pendente. Registre uma nova ficha em um paciente para atualizar a evolução.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
