import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorNote } from '../../components/Feedback';
import { client } from '../../lib/client';
import { usePatientContext } from './context';

export function PatientDataPage() {
  const { patient: p, id } = usePatientContext();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deletion = useMutation({
    mutationFn: () => client<void>(`/patients/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate('/pacientes');
    },
  });
  const none = 'Não informado';
  const list = (rows: Array<[string, string]>) => (
    <dl className="dl">
      {rows.map(([label, value]) => (
        <FragmentRow key={label} label={label} value={value} />
      ))}
    </dl>
  );
  return (
    <div className="stack">
      <div className="panel">
        <div className="head-row">
          <h2>Perfil</h2>
          <Link className="btn" to={`/pacientes/${id}/editar`}>
            Editar dados
          </Link>
        </div>
        <h3 style={{ marginTop: 14 }}>Pessoa</h3>
        {list([
          ['Nome completo', p.name || none],
          ['Iniciais', p.initials],
          ['Idade', `${p.age} anos`],
          ['Escolaridade', p.educationYears == null ? none : `${p.educationYears} anos de estudo`],
          ['Interesses e história de vida', p.interests || none],
        ])}
        <h3 style={{ marginTop: 18 }}>Contato</h3>
        {list([
          ['Telefone', p.phone || none],
          ['Endereço', p.address || none],
        ])}
        <h3 style={{ marginTop: 18 }}>Contato de emergência</h3>
        {list([
          ['Nome', p.emergencyContact.name || none],
          ['Telefone', p.emergencyContact.phone || none],
          ['Grau de parentesco', p.emergencyContact.relationship || none],
        ])}
        <h3 style={{ marginTop: 18 }}>Funcional</h3>
        {list([
          ['Visão', p.vision],
          ['Audição', p.hearing],
          ['Mobilidade', p.mobility],
        ])}
        <h3 style={{ marginTop: 18 }}>Contexto</h3>
        {list([
          ['Modalidade', p.group],
          ['Profissional responsável', p.responsibleName || p.responsibleUsername],
          ['Objetivo da estimulação', p.objective || none],
        ])}
      </div>
      {confirmDelete ? (
        <div className="note warn">
          <p>Excluir o paciente {p.id}? Isso remove as fichas, a evolução e as sugestões dele.</p>
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              className="btn danger small"
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              Sim, excluir
            </button>
            <button className="btn small" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
          <ErrorNote error={deletion.error} />
        </div>
      ) : (
        <div>
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>
            Excluir paciente
          </button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
