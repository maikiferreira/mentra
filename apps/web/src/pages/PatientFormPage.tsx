import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EMERGENCY_RELATIONSHIPS, LIMITATIONS, PATIENT_GROUPS } from '@mente-ativa/shared';
import { jsonBody, type Patient } from '../api';
import { useUIStore } from '../ui-store';
import { ErrorNote, Loading } from '../components/Feedback';
import { client, errorMessage } from '../lib/client';

type PatientFormValues = {
  name: string;
  age: string;
  educationYears: string;
  group: string;
  objective: string;
  interests: string;
  vision: string;
  hearing: string;
  mobility: string;
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
};

const blankPatient = (): PatientFormValues => ({
  name: '',
  age: '',
  educationYears: '',
  group: PATIENT_GROUPS[0],
  objective: '',
  interests: '',
  vision: LIMITATIONS[0],
  hearing: LIMITATIONS[0],
  mobility: LIMITATIONS[0],
  phone: '',
  address: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelationship: EMERGENCY_RELATIONSHIPS[0],
});

export function PatientFormPage({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams();
  const session = useUIStore((state) => state.session)!;
  const patientQuery = useQuery({
    queryKey: ['patient', id],
    queryFn: () => client<Patient>(`/patients/${id}`),
    enabled: editing,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<PatientFormValues>(blankPatient);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const patient = patientQuery.data;
    if (!patient || initialized) return;
    // Hydrate the edit form once after its asynchronous patient DTO arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues({
      // Pacientes cadastrados só com iniciais começam com o nome em branco.
      name: patient.name,
      age: String(patient.age),
      educationYears: patient.educationYears == null ? '' : String(patient.educationYears),
      group: patient.group,
      objective: patient.objective,
      interests: patient.interests,
      vision: patient.vision,
      hearing: patient.hearing,
      mobility: patient.mobility,
      phone: patient.phone,
      address: patient.address,
      emergencyName: patient.emergencyContact.name,
      emergencyPhone: patient.emergencyContact.phone,
      emergencyRelationship: patient.emergencyContact.relationship,
    });
    setInitialized(true);
  }, [initialized, patientQuery.data]);
  const set = (key: keyof PatientFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: values.name,
        age: values.age === '' ? '' : Number(values.age),
        educationYears: values.educationYears === '' ? null : Number(values.educationYears),
        group: values.group,
        objective: values.objective,
        interests: values.interests,
        vision: values.vision,
        hearing: values.hearing,
        mobility: values.mobility,
        phone: values.phone,
        address: values.address,
        emergencyContact: {
          name: values.emergencyName,
          phone: values.emergencyPhone,
          relationship: values.emergencyRelationship,
        },
      };
      return client<Patient>(editing ? `/patients/${id}` : '/patients', {
        method: editing ? 'PUT' : 'POST',
        body: jsonBody(body),
      });
    },
    onSuccess: async (patient) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient'] });
      navigate(editing ? `/pacientes/${patient.id}/dados` : `/pacientes/${patient.id}`);
    },
    onError: (saveError) => setError(errorMessage(saveError)),
  });
  if (editing && patientQuery.isLoading) return <Loading />;
  if (editing && patientQuery.error) return <ErrorNote error={patientQuery.error} />;
  const field = (
    key: keyof PatientFormValues,
    label: string,
    type = 'text',
    options?: {
      hint?: string;
      full?: boolean;
      placeholder?: string;
      choices?: readonly string[];
      rows?: number;
    },
  ) => (
    <label className={options?.full ? 'full' : ''} htmlFor={`pf-${key}`} key={key}>
      {label}
      {options?.choices ? (
        <select
          id={`pf-${key}`}
          value={values[key]}
          onChange={(event) => set(key, event.target.value)}
        >
          {options.choices.map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </select>
      ) : options?.rows ? (
        <textarea
          id={`pf-${key}`}
          rows={options.rows}
          value={values[key]}
          onChange={(event) => set(key, event.target.value)}
        />
      ) : (
        <input
          id={`pf-${key}`}
          type={type}
          value={values[key]}
          placeholder={options?.placeholder}
          maxLength={key === 'name' ? 120 : undefined}
          onChange={(event) => set(key, event.target.value)}
        />
      )}{' '}
      {options?.hint && <small className="muted">{options.hint}</small>}
    </label>
  );
  const responsible = editing ? patientQuery.data?.responsibleName : session.user.name;
  return (
    <>
      <div className="crumbs">
        <Link className="link" to={editing ? `/pacientes/${id}/dados` : '/pacientes'}>
          {editing ? `Paciente ${id}` : 'Pacientes'}
        </Link>
        <span className="muted">/</span>
        <span>{editing ? 'Editar dados' : 'Novo'}</span>
      </div>
      <div className="head">
        <h1>{editing ? `Editar dados do paciente ${id}` : 'Novo paciente'}</h1>
        <p className="muted">
          Nome, endereço e telefone são dados pessoais: registre-os com o consentimento do paciente
          (LGPD).
        </p>
      </div>
      <div className="panel">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            save.mutate();
          }}
        >
          <div>
            <h3>Pessoa</h3>
            <div className="pf">
              {field('name', 'Nome completo *', 'text', {
                placeholder: 'Ex.: Maria da Silva',
                full: true,
              })}
              {/* Idade e escolaridade lado a lado, com os campos alinhados. */}
              <div className="pf-pair">
                {field('age', 'Idade *', 'number', { placeholder: 'Ex.: 78' })}
                {field('educationYears', 'Escolaridade (anos de estudo)', 'number', {
                  placeholder: 'Ex.: 4',
                  hint: 'A escolaridade ajuda a interpretar a pontuação.',
                })}
              </div>
              {field('interests', 'Interesses e história de vida', 'text', {
                full: true,
                rows: 3,
                hint: 'Profissão, hobbies e músicas preferidas ajudam a personalizar as atividades.',
              })}
            </div>
          </div>
          <div>
            <h3>Contato</h3>
            <div className="pf">
              {field('phone', 'Telefone', 'tel', { placeholder: '(32) 90000-0000' })}
              {field('address', 'Endereço', 'text', {
                full: true,
                placeholder: 'Rua, número, bairro, cidade',
              })}
            </div>
          </div>
          <div>
            <h3>Contato de emergência</h3>
            <div className="pf">
              {field('emergencyName', 'Nome *')}
              {field('emergencyPhone', 'Telefone *', 'tel', { placeholder: '(32) 90000-0000' })}
              {field('emergencyRelationship', 'Grau de parentesco', 'text', {
                choices: EMERGENCY_RELATIONSHIPS,
              })}
            </div>
          </div>
          <div>
            <h3>Funcional</h3>
            <div className="pf">
              {field('vision', 'Visão', 'text', { choices: LIMITATIONS })}
              {field('hearing', 'Audição', 'text', { choices: LIMITATIONS })}
              {field('mobility', 'Mobilidade', 'text', { choices: LIMITATIONS })}
            </div>
          </div>
          <div>
            <h3>Contexto</h3>
            <div className="pf">
              {field('group', 'Modalidade', 'text', { choices: PATIENT_GROUPS })}
              <label htmlFor="pf-responsible">
                Profissional responsável
                <input id="pf-responsible" value={responsible ?? ''} readOnly />
                <small className="muted">Definido pelo usuário que cadastra o paciente.</small>
              </label>
              {field('objective', 'Objetivo da estimulação', 'text', {
                full: true,
                placeholder: 'Ex.: Manter a atenção no dia a dia',
              })}
            </div>
          </div>
          {(error || save.error) && <ErrorNote error={error || save.error} />}
          <div className="actions">
            <button className="btn primary" type="submit" disabled={save.isPending}>
              Salvar
            </button>
            <Link className="btn" to={editing ? `/pacientes/${id}/dados` : '/pacientes'}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
