import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { weekStart } from '@mente-ativa/shared';
import type { Evolution, Patient } from '../../api';
import { ErrorNote, Loading } from '../../components/Feedback';
import { client } from '../../lib/client';
import { isoToBR, todayISO } from '../../lib/format';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Rotina da semana em formato para imprimir e entregar ao cuidador. */
export function PrintRoutinePage() {
  const { id = '' } = useParams();
  const patient = useQuery({
    queryKey: ['patient', id],
    queryFn: () => client<Patient>(`/patients/${id}`),
  });
  const evolution = useQuery({
    queryKey: ['evolution', id],
    queryFn: () => client<Evolution>(`/patients/${id}/evolution`),
  });
  if (patient.isLoading || evolution.isLoading) return <Loading />;
  if (patient.error || evolution.error)
    return <ErrorNote error={patient.error ?? evolution.error} />;
  const { routine } = evolution.data!;
  const monday = weekStart(todayISO());
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  return (
    <div className="print-page">
      <div className="actions no-print" style={{ marginBottom: 18 }}>
        <Link className="btn" to="/rotinas">
          Voltar
        </Link>
        <button className="btn primary" type="button" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <h1>Rotina de atividades</h1>
      <p className="muted">
        Paciente {patient.data!.id} · {patient.data!.initials}, {patient.data!.age} anos · Semana de{' '}
        {isoToBR(monday)} a {isoToBR(sunday)} · Responsável: {patient.data!.responsibleName}
      </p>
      {patient.data!.interests && (
        <p className="muted">Para personalizar as atividades: {patient.data!.interests}</p>
      )}
      {routine.length ? (
        <table className="print-routine">
          <thead>
            <tr>
              <th>Atividade</th>
              {DAYS.map((day) => (
                <th key={day} className="day">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routine.map((item) => (
              <tr key={item.key}>
                <td>
                  <b>{item.title}</b>
                  <br />
                  {item.text}
                  <br />
                  <span className="muted">
                    {item.duration} · {item.frequency}
                  </span>
                </td>
                {DAYS.map((day) => (
                  <td key={day} className="day" aria-label={`${day}: marcar quando fizer`}>
                    <span className="box" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note">Nenhuma atividade aceita na rotina deste paciente ainda.</p>
      )}
      <div className="print-notes">
        <b>Observações do cuidador</b>
        <div className="lines" />
      </div>
      <p className="srcnote">
        Marque o dia em que cada atividade foi feita e traga a folha na próxima sessão.
      </p>
    </div>
  );
}
