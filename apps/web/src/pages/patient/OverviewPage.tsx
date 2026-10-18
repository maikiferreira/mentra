import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PatientOverview } from '@mente-ativa/shared';
import { ErrorNote, Loading } from '../../components/Feedback';
import { client } from '../../lib/client';
import { LEVEL_CHIP, TONE_CHIP, isoToBR, scoreText } from '../../lib/format';
import { usePatientContext } from './context';

/** Resultados por área, alertas que cruzam as áreas e agenda de reavaliação. */
export function OverviewPage() {
  const { id } = usePatientContext();
  const query = useQuery({
    queryKey: ['overview', id],
    queryFn: () => client<PatientOverview>(`/patients/${id}/overview`),
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const overview = query.data!;
  return (
    <div className="stack">
      <div className="actions">
        <Link className="btn primary" to={`/pacientes/${id}/relatorio`}>
          Gerar relatório (PDF)
        </Link>
        <Link className="btn" to={`/pacientes/${id}/rotina`}>
          Imprimir rotina
        </Link>
      </div>
      {overview.alerts.length > 0 && (
        <div className="panel">
          <h2>Pontos de atenção entre as áreas</h2>
          <div className="stack" style={{ gap: 10 }}>
            {overview.alerts.map((alert) => (
              <div className={`note ${alert.level === 'attention' ? 'warn' : ''}`} key={alert.key}>
                <b>{alert.title}.</b> {alert.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="areas">
        {overview.categories.map((category) => (
          <section className="panel" key={category.key} aria-labelledby={`area-${category.key}`}>
            <h2 id={`area-${category.key}`}>{category.name}</h2>
            <ul className="area-list">
              {category.instruments.map((status) => (
                <li key={status.key}>
                  <div className="head-row">
                    <b>{status.shortName}</b>
                    {status.latest ? (
                      <span className={`chip ${LEVEL_CHIP[status.latest.level]}`}>
                        {scoreText(status.latest.total, status.latest.max)}
                      </span>
                    ) : (
                      <span className="chip">Não aplicado</span>
                    )}
                  </div>
                  {status.latest ? (
                    <>
                      <span className="muted">
                        {status.latest.date} · {status.latest.label}
                      </span>
                      <span className="row">
                        {status.trend.kind !== 'first' && (
                          <span className={`chip ${TONE_CHIP[status.trend.tone]}`}>
                            {status.trend.label}
                          </span>
                        )}
                        {status.overdue ? (
                          <span className="chip warn">
                            Reavaliação atrasada desde {isoToBR(status.nextDue!)}
                          </span>
                        ) : (
                          <span className="muted">Reavaliar em {isoToBR(status.nextDue!)}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <Link
                      className="link"
                      to={`/pacientes/${id}`}
                      state={{ newInstrument: status.key }}
                    >
                      Registrar {status.shortName}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="srcnote">
        Reavaliação sugerida a cada 6 meses quando o resultado está dentro do esperado e a cada 3
        meses quando pede atenção. Os alertas cruzam os resultados mais recentes de cada teste e não
        substituem a avaliação clínica.
      </p>
    </div>
  );
}
