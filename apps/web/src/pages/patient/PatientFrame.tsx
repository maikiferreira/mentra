import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type Patient } from '../../api';
import { Loading } from '../../components/Feedback';
import { client } from '../../lib/client';
import { type PatientContext } from './context';
import { patientDisplayName } from '@mente-ativa/shared';

export function PatientFrame() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['patient', id],
    queryFn: () => client<Patient>(`/patients/${id}`),
  });
  const location = useLocation();
  const section = location.pathname.endsWith('/evolucao')
    ? 'evol'
    : location.pathname.endsWith('/dados')
      ? 'dados'
      : location.pathname.endsWith('/visao-geral')
        ? 'geral'
        : 'fichas';
  if (query.isLoading) return <Loading />;
  if (query.error)
    return (
      <>
        <div className="head">
          <h1>Paciente não encontrado</h1>
          <p className="muted">Não foi possível abrir este paciente.</p>
        </div>
        <Link className="btn" to="/pacientes">
          Pacientes
        </Link>
      </>
    );
  const patient = query.data!;
  return (
    <>
      <div className="crumbs">
        <Link className="link" to="/pacientes">
          Pacientes
        </Link>
        <span className="muted">/</span>
        <span>Paciente {patient.id}</span>
      </div>
      <div className="head">
        <h1>
          Paciente {patient.id} · {patientDisplayName(patient)}, {patient.age} anos
        </h1>
        <p className="muted">
          {patient.group}
          {patient.educationYears != null ? ` · ${patient.educationYears} anos de estudo` : ''} ·
          Responsável: {patient.responsibleName || patient.responsibleUsername}
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label="Seções do paciente">
        <Link
          className="tab"
          role="tab"
          aria-selected={section === 'fichas'}
          to={`/pacientes/${id}`}
        >
          Fichas
        </Link>
        <Link
          className="tab"
          role="tab"
          aria-selected={section === 'geral'}
          to={`/pacientes/${id}/visao-geral`}
        >
          Visão geral
        </Link>
        <Link
          className="tab"
          role="tab"
          aria-selected={section === 'evol'}
          to={`/pacientes/${id}/evolucao`}
        >
          Evolução e sugestões
        </Link>
        <Link
          className="tab"
          role="tab"
          aria-selected={section === 'dados'}
          to={`/pacientes/${id}/dados`}
        >
          Dados do paciente
        </Link>
      </div>
      <Outlet context={{ patient, id } satisfies PatientContext} />
    </>
  );
}
