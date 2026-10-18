import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { patientDisplayName, getInstrument, type PatientOverview } from '@mente-ativa/shared';
import type { Evolution, Patient } from '../../api';
import { useUIStore } from '../../ui-store';
import { ErrorNote, Loading } from '../../components/Feedback';
import { client, dateBR } from '../../lib/client';
import { LEVEL_NAME, scoreText } from '../../lib/format';

/** Relatório do paciente para a família ou o médico: imprimir ou salvar como PDF. */
export function ReportPage() {
  const { id = '' } = useParams();
  const session = useUIStore((state) => state.session)!;
  const patient = useQuery({
    queryKey: ['patient', id],
    queryFn: () => client<Patient>(`/patients/${id}`),
  });
  const overview = useQuery({
    queryKey: ['overview', id],
    queryFn: () => client<PatientOverview>(`/patients/${id}/overview`),
  });
  const evolution = useQuery({
    queryKey: ['evolution', id],
    queryFn: () => client<Evolution>(`/patients/${id}/evolution`),
  });
  const queries = [patient, overview, evolution];
  if (queries.some((query) => query.isLoading)) return <Loading />;
  const failed = queries.find((query) => query.error);
  if (failed) return <ErrorNote error={failed.error} />;
  const p = patient.data!;
  const { categories, alerts } = overview.data!;
  const { instruments, routine } = evolution.data!;
  const applied = categories.flatMap((category) =>
    category.instruments.filter((status) => status.latest),
  );
  return (
    <article className="print-page report">
      <div className="actions no-print" style={{ marginBottom: 18 }}>
        <Link className="btn" to={`/pacientes/${id}/visao-geral`}>
          Voltar
        </Link>
        <button className="btn primary" type="button" onClick={() => window.print()}>
          Imprimir ou salvar em PDF
        </button>
        <span className="muted">
          Na janela de impressão, escolha "Salvar como PDF" para gerar o arquivo.
        </span>
      </div>
      <header>
        <p className="muted">Mente Ativa · Relatório de acompanhamento</p>
        <h1>
          Paciente {p.id} · {patientDisplayName(p)}
        </h1>
        <p>
          {p.age} anos
          {p.educationYears !== null ? ` · ${p.educationYears} anos de estudo` : ''} · {p.group} ·
          Responsável: {p.responsibleName} · Emitido em {dateBR()}
        </p>
        {p.objective && <p>Objetivo do acompanhamento: {p.objective}</p>}
      </header>

      <section>
        <h2>Resumo por área</h2>
        {applied.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th>Área</th>
                <th>Teste</th>
                <th>Data</th>
                <th>Resultado</th>
                <th>Interpretação</th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((category) =>
                category.instruments
                  .filter((status) => status.latest)
                  .map((status) => (
                    <tr key={status.key}>
                      <td>{category.name}</td>
                      <td>{status.shortName}</td>
                      <td>{status.latest!.date}</td>
                      <td>{scoreText(status.latest!.total, status.latest!.max)}</td>
                      <td>
                        <b>{LEVEL_NAME[status.latest!.level]}.</b> {status.latest!.label}
                      </td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        ) : (
          <p>Nenhum teste aplicado até o momento.</p>
        )}
      </section>

      {alerts.length > 0 && (
        <section>
          <h2>Integração dos resultados</h2>
          <ul>
            {alerts.map((alert) => (
              <li key={alert.key}>
                <b>{alert.title}.</b> {alert.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Evolução por teste</h2>
        {instruments.map((instrument) => {
          const status = applied.find((entry) => entry.key === instrument.key);
          return (
            <div className="report-test" key={instrument.key}>
              <h3>{instrument.name}</h3>
              <p>
                {instrument.series
                  .map((entry) => `${entry.date}: ${scoreText(entry.total, instrument.max)}`)
                  .join(' → ')}
                {instrument.series.length > 1 ? ` (${instrument.trend.label})` : ''}
              </p>
              {status?.latest?.observations && (
                <p>Observações da última ficha: {status.latest.observations}</p>
              )}
            </div>
          );
        })}
      </section>

      <section>
        <h2>Rotina de atividades</h2>
        {routine.length ? (
          <table className="report-table">
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Origem</th>
                <th>Frequência</th>
                <th>Adesão recente</th>
              </tr>
            </thead>
            <tbody>
              {routine.map((item) => (
                <tr key={item.key}>
                  <td>
                    <b>{item.title}</b>
                    <br />
                    {item.text}
                  </td>
                  <td>{getInstrument(item.instrument)?.shortName}</td>
                  <td>
                    {item.duration} · {item.frequency}
                  </td>
                  <td>
                    {Math.round(item.adherence * 100)}% ({item.weeks.filter((w) => w.done).length}/
                    {item.weeks.length} sem.)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Nenhuma atividade na rotina até o momento.</p>
        )}
      </section>

      <footer>
        <p className="srcnote">
          Os testes aplicados são instrumentos de rastreio: não fecham diagnóstico. A tecnologia
          sugere; o profissional decide. As sugestões não são diagnóstico nem prescrição.
        </p>
        <div className="signature">
          <span />
          <p>{session.user.name} · profissional responsável pela avaliação</p>
        </div>
      </footer>
    </article>
  );
}
