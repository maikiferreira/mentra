import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMERGENCY_RELATIONSHIPS,
  LIMITATIONS,
  MEEM_DOMAINS,
  PATIENT_GROUPS,
  TRIAL_PROFILES,
  totalScore,
  type MeemScores,
} from '@mente-ativa/shared';
import logo from './assets/logo.jpg';
import {
  api,
  jsonBody,
  type Dashboard,
  type Evaluation,
  type Evolution,
  type Patient,
  type PatientSummary,
  type PendingFicha,
  type Session,
  type Suggestion,
} from './api';
import { useUIStore } from './ui-store';

const client = <T,>(path: string, options?: RequestInit): Promise<T> =>
  api<T>(path, options, useUIStore.getState().session?.token);
const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const dateBR = () =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const shortDate = (date: string) => date.split(' ')[0];
const errorMessage = (error: unknown) =>
  typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : 'Ocorreu um erro inesperado.';

function ErrorNote({ error }: { error: unknown }) {
  return error ? (
    <div className="note warn" role="alert">
      {errorMessage(error)}
    </div>
  ) : null;
}

function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img className="logo" src={logo} alt="" width="40" height="40" />
      <span className="bn">Mente Ativa</span>
    </div>
  );
}

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell out">
      <div className="content">
        <main>{children}</main>
        <p className="principle">
          <b>A tecnologia sugere. O profissional decide.</b> As sugestões não são diagnóstico nem
          prescrição.
        </p>
      </div>
    </div>
  );
}

function WelcomeModal() {
  const welcome = useUIStore((state) => state.welcome);
  const setWelcome = useUIStore((state) => state.setWelcome);
  useEffect(() => {
    if (!welcome) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWelcome(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [setWelcome, welcome]);
  if (!welcome) return null;
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Bem-vindo(a), {welcome.name.trim().split(/\s+/)[0]}!</h2>
        <p>
          Seu acesso de teste ao Mente Ativa está liberado. Anote seus dados para entrar nas
          próximas vezes:
        </p>
        <dl className="cred">
          <dt>Usuário</dt>
          <dd>{welcome.username}</dd>
          <dt>Senha</dt>
          <dd>{welcome.password}</dd>
        </dl>
        <p className="muted">
          Você começa sem nenhum paciente cadastrado. Use "Novo paciente" para criar o primeiro.
        </p>
        <button className="btn primary" autoFocus onClick={() => setWelcome(null)}>
          Entendi
        </button>
      </div>
    </div>
  );
}

function Protected() {
  const session = useUIStore((state) => state.session);
  const location = useLocation();
  const queryClient = useQueryClient();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    client('/auth/me').catch(() => {
      if (active) {
        useUIStore.getState().logout();
        queryClient.clear();
      }
    });
    return () => {
      active = false;
    };
  }, [queryClient, session]);
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const session = useUIStore((state) => state.session)!;
  const logout = useUIStore((state) => state.logout);
  const queryClient = useQueryClient();
  const location = useLocation();
  const patients = useQuery({
    queryKey: ['patients', session.user.username],
    queryFn: () => client<{ items: PatientSummary[] }>('/patients'),
  });
  const pendingCount = patients.data?.items?.filter((item) => item.hasPending).length ?? 0;
  const active =
    location.pathname === '/'
      ? 'home'
      : location.pathname.startsWith('/pacientes')
        ? 'list'
        : location.pathname.startsWith('/rotinas')
          ? 'routine'
          : 'users';
  const icon = {
    home: (
      <svg viewBox="0 0 24 24">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
    list: (
      <svg viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
        <path d="M16 4.7a3.5 3.5 0 010 6.6M18.5 14.9c1.6.8 2.8 2.5 3 5.1" />
      </svg>
    ),
    routine: (
      <svg viewBox="0 0 24 24">
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
      </svg>
    ),
  };
  const nav = [
    ['home', 'Início', '/'],
    ['list', 'Pacientes', '/pacientes'],
    ['routine', 'Rotinas', '/rotinas'],
  ] as const;
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav aria-label="Menu principal">
          {[
            ...nav,
            ...(session.user.role === 'admin' ? [['users', 'Usuários', '/usuarios'] as const] : []),
          ].map(([key, label, to]) => (
            <Link
              className="navb"
              key={key}
              to={to}
              aria-current={active === key ? 'page' : undefined}
            >
              {icon[key]}
              <span>{label}</span>
              {key === 'list' && pendingCount > 0 && <span className="cnt">{pendingCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="usr">
          <div>
            <b>{session.user.name}</b>
            <span className="muted">
              {session.user.role === 'admin' ? 'Administrador' : 'Profissional'} ·{' '}
              {session.user.username}
            </span>
          </div>
          <button
            className="btn small"
            onClick={() => {
              logout();
              queryClient.clear();
            }}
          >
            Sair
          </button>
        </div>
        {((import.meta as ImportMeta & { env?: { VITE_SHOW_DEMO_FLAG?: string } }).env
          ?.VITE_SHOW_DEMO_FLAG ?? 'true') === 'true' && (
          <span className="flag">Protótipo · dados fictícios</span>
        )}
      </aside>
      <div className="content">
        <main>{children}</main>
        <p className="principle">
          <b>A tecnologia sugere. O profissional decide.</b> As sugestões não são diagnóstico nem
          prescrição.
        </p>
      </div>
      <WelcomeModal />
    </div>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'signup' | 'trial' }) {
  const session = useUIStore((state) => state.session);
  const setSession = useUIStore((state) => state.setSession);
  const setWelcome = useUIStore((state) => state.setWelcome);
  const [values, setValues] = useState<Record<string, string | boolean>>({
    profile: TRIAL_PROFILES[0],
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (session) return <Navigate to="/" replace />;
  const change = (field: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError('');
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      let result: Session & { credentials?: { username: string; password: string } };
      if (mode === 'login')
        result = await api('/auth/login', {
          method: 'POST',
          body: jsonBody({ username: values.username ?? '', password: values.password ?? '' }),
        });
      else if (mode === 'signup')
        result = await api('/auth/signup', {
          method: 'POST',
          body: jsonBody({
            name: values.name ?? '',
            username: values.username ?? '',
            password: values.password ?? '',
            passwordConfirmation: values.confirmation ?? '',
          }),
        });
      else
        result = await api('/auth/trial-access', {
          method: 'POST',
          body: jsonBody({
            name: values.name ?? '',
            phone: values.phone ?? '',
            email: values.email ?? '',
            profile: values.profile ?? TRIAL_PROFILES[0],
            workplace: values.workplace ?? '',
            consent: values.consent === true,
          }),
        });
      setSession({ token: result.token, user: result.user });
      if (result.credentials) setWelcome({ ...result.credentials, name: result.user.name });
      queryClient.clear();
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };
  const brand = <Brand />;
  const input = (
    key: string,
    label: string,
    type = 'text',
    autocomplete = key,
    placeholder?: string,
  ) => (
    <label htmlFor={`auth-${key}`} key={key}>
      {label}
      <input
        id={`auth-${key}`}
        type={type}
        autoComplete={autocomplete}
        placeholder={placeholder}
        value={String(values[key] ?? '')}
        onChange={(event) => change(key, event.target.value)}
      />
    </label>
  );
  if (mode === 'trial')
    return (
      <div className="auth">
        <div className="panel">
          {brand}
          <div>
            <h1>Quero testar o Mente Ativa</h1>
            <p className="muted">
              Acompanhe a evolução cognitiva dos seus pacientes e planeje a rotina de atividades.
              Deixe seu contato e liberamos um acesso de teste na hora, sem pacientes cadastrados.
            </p>
          </div>
          <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
            {input('name', 'Nome', 'text', 'name')}
            {input('phone', 'Telefone (WhatsApp)', 'tel', 'tel', '(32) 90000-0000')}
            {input('email', 'E-mail', 'email', 'email', 'nome@exemplo.com')}
            <label htmlFor="auth-profile">
              Como você atua?
              <select
                id="auth-profile"
                value={String(values.profile)}
                onChange={(event) => change('profile', event.target.value)}
              >
                {TRIAL_PROFILES.map((profile) => (
                  <option key={profile}>{profile}</option>
                ))}
              </select>
            </label>
            {input(
              'workplace',
              'Onde você atua (opcional)',
              'text',
              'organization',
              'Ex.: clínica, ILPI, centro-dia',
            )}
            <label className="chk" htmlFor="auth-consent">
              <input
                id="auth-consent"
                type="checkbox"
                checked={values.consent === true}
                onChange={(event) => change('consent', event.target.checked)}
              />
              <span>
                Autorizo o contato sobre o teste do Mente Ativa. Uso estes dados só para isso.
              </span>
            </label>
            {error && (
              <div className="note warn" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Enviando…' : 'Quero testar'}
            </button>
          </form>
          <p className="srcnote">
            Seu acesso: usuário = seu primeiro nome. Senha = os 4 últimos dígitos do telefone.
          </p>
          <p className="muted">
            <Link className="link" to="/login">
              Voltar ao login
            </Link>
          </p>
        </div>
      </div>
    );
  const signup = mode === 'signup';
  return (
    <div className="auth">
      <div className="panel">
        {brand}
        <div>
          <h1>{signup ? 'Criar conta' : 'Entrar'}</h1>
          <p className="muted">
            {signup
              ? 'Cadastre-se para acompanhar seus pacientes.'
              : 'Acesse para acompanhar seus pacientes.'}
          </p>
        </div>
        <form className="stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
          {signup && input('name', 'Nome', 'text', 'name')}
          {input('username', 'Usuário', 'text', 'username')}
          {input('password', 'Senha', 'password', signup ? 'new-password' : 'current-password')}
          {signup && input('confirmation', 'Confirmar senha', 'password', 'new-password')}
          {error && (
            <div className="note warn" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary" type="submit">
            {signup ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
        <p className="muted">
          {signup ? 'Já tem conta? ' : 'Ainda não tem conta? '}
          <Link className="link" to={signup ? '/login' : '/cadastro'}>
            {signup ? 'Entrar' : 'Criar conta'}
          </Link>
        </p>
        {!signup && (
          <>
            <div className="cta">
              <b>Quer testar o Mente Ativa?</b>
              <p className="muted">Deixe seu contato e avisamos quando houver vaga.</p>
              <Link className="btn" to="/quero-testar">
                Quero testar
              </Link>
            </div>
            {((import.meta as ImportMeta & { env?: { VITE_SHOW_DEMO_HINT?: string } }).env
              ?.VITE_SHOW_DEMO_HINT ?? 'true') === 'true' && (
              <div className="note">
                Acesso de demonstração: usuário <b>admin</b>, senha <b>admin</b>.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PatientList() {
  const session = useUIStore((state) => state.session)!;
  const query = useQuery({
    queryKey: ['patients', session.user.username],
    queryFn: () => client<{ items: PatientSummary[] }>('/patients'),
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
            <p className="muted">
              Identificados só por código e iniciais. O protótipo usa fichas e pontuações de
              exemplo.
            </p>
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
                    {patient.lastTotal === null ? '—' : `MEEM ${patient.lastTotal}/30`}
                  </span>
                  <span className="tr">
                    <span
                      className={`chip ${patient.trend.kind === 'up' ? 'up' : patient.trend.kind === 'down' ? 'down' : ''}`}
                    >
                      {patient.trend.label}
                    </span>{' '}
                    {patient.hasPending && <span className="chip warn">1 ficha nova</span>}
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

type PatientFormValues = {
  initials: string;
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
  initials: '',
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
function PatientFormPage({ editing = false }: { editing?: boolean }) {
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
      initials: patient.initials,
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
        initials: values.initials,
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
          maxLength={key === 'initials' ? 10 : undefined}
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
          Identifique o paciente só por iniciais. No protótipo, use dados fictícios. No produto,
          endereço e telefone exigem o consentimento do paciente (LGPD).
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
              {field('initials', 'Iniciais *', 'text', { placeholder: 'Ex.: M.S.' })}
              {field('age', 'Idade *', 'number', { placeholder: 'Ex.: 78' })}
              {field('educationYears', 'Escolaridade (anos de estudo)', 'number', {
                placeholder: 'Ex.: 4',
                hint: 'A escolaridade ajuda a interpretar a pontuação.',
              })}
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

type PatientContext = { patient: Patient; id: string };
function usePatientContext() {
  return useOutletContext<PatientContext>();
}
function PatientFrame() {
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
          Paciente {patient.id} · {patient.initials}, {patient.age} anos
        </h1>
        <p className="muted">
          {patient.group}
          {patient.educationYears != null ? ` · ${patient.educationYears} anos de estudo` : ''} ·
          Responsável: {patient.responsibleName || patient.responsibleUsername} · Instrumento de
          exemplo: MEEM (0 a 30)
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

function PatientFichas() {
  const { id } = usePatientContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [step, setStep] = useState(0);
  const [pendingOverride, setPendingOverride] = useState<PendingFicha | null>(null);
  const [scores, setScores] = useState<MeemScores | null>(null);
  const [observations, setObservations] = useState('');
  const [flagConfirmed, setFlagConfirmed] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fichasQuery = useQuery({
    queryKey: ['fichas', id],
    queryFn: () =>
      client<{ evaluations: Evaluation[]; pending: PendingFicha | null }>(`/patients/${id}/fichas`),
  });
  const data = fichasQuery.data;
  const pending = pendingOverride ?? data?.pending ?? null;
  useEffect(() => {
    if (!pending) return;
    // Resume an existing pending ficha from its API DTO when reopening the route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScores((current) => current ?? { ...pending.scores });
    setObservations((current) => current || pending.observations);
  }, [pending]);
  const total = scores ? totalScore(scores) : 0;
  const sumMatches = Boolean(pending && total === pending.writtenTotal);
  const confirm = useMutation({
    mutationFn: () =>
      client<{ justConfirmed: string }>(`/patients/${id}/fichas/pending/confirm`, {
        method: 'POST',
        body: jsonBody({ scores, observations, flagConfirmed }),
      }),
    onSuccess: async (result: { justConfirmed: string }) => {
      useUIStore.getState().markConfirmed(id, result.justConfirmed);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fichas', id] }),
        queryClient.invalidateQueries({ queryKey: ['patient', id] }),
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['evolution', id] }),
      ]);
      navigate(`/pacientes/${id}/evolucao`);
    },
  });
  const upload = async () => {
    setUploading(true);
    setError(null);
    try {
      const response = await client<{ pending: PendingFicha }>(`/patients/${id}/fichas/upload`, {
        method: 'POST',
        body: '{}',
      });
      await wait(1100);
      setPendingOverride(response.pending);
      setScores({ ...response.pending.scores });
      setObservations(response.pending.observations);
      setFlagConfirmed(false);
      await queryClient.invalidateQueries({ queryKey: ['fichas', id] });
    } catch (uploadError) {
      setError(uploadError);
      await queryClient.invalidateQueries({ queryKey: ['fichas', id] });
    } finally {
      setUploading(false);
    }
  };
  const extract = async () => {
    setExtracting(true);
    setStep(0);
    for (let index = 1; index <= 3; index += 1) {
      await wait(650);
      setStep(index);
    }
    setExtracting(false);
  };
  if (fichasQuery.isLoading) return <Loading />;
  if (fichasQuery.error) return <ErrorNote error={fichasQuery.error} />;
  if (pending && scores) {
    const lines = pending.sheetLines;
    const names = ['Lendo a ficha', 'Identificando os campos', 'Conferindo a soma do total'];
    return (
      <>
        <ErrorNote error={error || confirm.error} />
        <div className="split">
          <div>
            <div className="paper">
              {lines.map((line) => (
                <div
                  className={`ln ${highlight === line.id ? 'hl' : ''}`}
                  id={line.id}
                  key={line.id}
                >
                  {line.title ? (
                    <span className="tt">{line.title}</span>
                  ) : (
                    <>
                      <span>
                        {line.id === 'l1' && line.left?.startsWith('Data: ')
                          ? `Data: ${shortDate(line.left.slice(6))}`
                          : line.left}
                      </span>
                      {line.right && <span>{line.right}</span>}
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="srcnote">
              Ficha de exemplo, escrita à mão. No produto: foto, PDF ou planilha.
            </p>
          </div>
          {extracting ? (
            <div className="panel">
              <h2>Extraindo…</h2>
              <ul className="steps">
                {names.map((name, index) => (
                  <li className={step > index ? 'done' : ''} key={name}>
                    <span className="dot" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : step === 3 ? (
            <div className="panel">
              <h2>Dados extraídos</h2>
              <div className="fields">
                <div className="fld">
                  <div>
                    <label>Data da avaliação</label>
                    <small>Fonte: linha 1</small>
                  </div>
                  <input
                    value={shortDate(pending.date)}
                    readOnly
                    data-src="l1"
                    onFocus={() => setHighlight('l1')}
                    onBlur={() => setHighlight(null)}
                  />
                </div>
                {MEEM_DOMAINS.map((domain, index) => {
                  const source = `l${index + 3}`;
                  const flagged = pending.flag === domain.key && !flagConfirmed;
                  return (
                    <div
                      className={`fld ${flagged ? 'flagged' : ''}`}
                      key={domain.key}
                      onMouseEnter={() => setHighlight(source)}
                      onMouseLeave={() => setHighlight(null)}
                    >
                      <div>
                        <label htmlFor={`f-${domain.key}`}>
                          {domain.name} (máx. {domain.max})
                        </label>
                        <small>
                          Fonte: linha {index + 3} da ficha
                          {flagged ? ' · baixa confiança, escrita pouco legível' : ''}
                        </small>
                        {flagged && (
                          <button
                            className="btn small"
                            style={{ marginTop: 6 }}
                            onClick={() => setFlagConfirmed(true)}
                          >
                            Está correto
                          </button>
                        )}
                      </div>
                      <input
                        id={`f-${domain.key}`}
                        type="number"
                        min={0}
                        max={domain.max}
                        value={scores[domain.key]}
                        data-src={source}
                        onFocus={() => setHighlight(source)}
                        onBlur={() => setHighlight(null)}
                        onChange={(event) =>
                          setScores((current) => ({
                            ...current!,
                            [domain.key]: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                  );
                })}
                <div className={`note ${sumMatches ? 'ok' : 'warn'}`} role="status">
                  {sumMatches
                    ? `A soma dos domínios (${total}) confere com o total escrito na ficha (${pending.writtenTotal}/30).`
                    : `A soma dos domínios (${total}) é diferente do total escrito na ficha (${pending.writtenTotal}/30). Revise os valores.`}
                </div>
                <div className="obs">
                  <label htmlFor="f-obs">Observações</label>
                  <textarea
                    id="f-obs"
                    value={observations}
                    onChange={(event) => setObservations(event.target.value)}
                    onFocus={() => setHighlight('l9')}
                    onBlur={() => setHighlight(null)}
                  />
                </div>
                <button
                  className="btn primary"
                  disabled={!flagConfirmed || !sumMatches || confirm.isPending}
                  onClick={() => confirm.mutate()}
                >
                  Confirmar ficha e atualizar evolução
                </button>
                <p className="srcnote">
                  {flagConfirmed && sumMatches
                    ? 'Tudo conferido.'
                    : 'Confirme o campo sinalizado e a soma para liberar o botão.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="panel">
              <h2>Extração dos dados</h2>
              <p className="muted" style={{ marginBottom: 14 }}>
                A IA lê a ficha e preenche os campos. Você confere cada um antes de salvar.
              </p>
              <button className="btn primary" onClick={extract}>
                Extrair dados com IA
              </button>
            </div>
          )}
        </div>
      </>
    );
  }
  const evaluations = data?.evaluations ?? [];
  return (
    <div className="stack">
      {useUIStore.getState().justConfirmed[id] && (
        <div className="note ok">
          Ficha de {shortDate(useUIStore.getState().justConfirmed[id]!)} confirmada. A evolução e as
          sugestões foram atualizadas.
        </div>
      )}
      <div className="panel">
        <h2>Fichas deste paciente</h2>
        {evaluations.length ? (
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Instrumento</th>
                  <th className="num">Total</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.date}>
                    <td>{evaluation.date}</td>
                    <td>MEEM</td>
                    <td className="num">{evaluation.total}/30</td>
                    <td>
                      <span className="chip up">Conferida</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhuma ficha enviada ainda.</p>
        )}
      </div>
      {uploading ? (
        <div className="drop">
          <h3>Recebendo a ficha…</h3>
          <ul className="steps">
            <li className="done">
              <span className="dot" />
              Arquivo recebido
            </li>
            <li>
              <span className="dot" />
              Preparando a leitura
            </li>
          </ul>
        </div>
      ) : (
        <div className="drop">
          <h3>Enviar nova ficha</h3>
          <p className="muted">
            No produto: foto, PDF ou planilha. No protótipo, o botão gera uma ficha de exemplo para
            este paciente.
          </p>
          <div>
            <button className="btn primary" onClick={upload}>
              Enviar nova ficha
            </button>
          </div>
        </div>
      )}
      {evaluations.length > 0 && (
        <Link className="btn" to={`/pacientes/${id}/evolucao`}>
          Ver evolução e sugestões
        </Link>
      )}
    </div>
  );
}

function PatientDataPage() {
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

function chart(series: NonNullable<Evolution['series']>) {
  const width = 560,
    height = 230,
    left = 40,
    right = 18,
    top = 16,
    bottom = 36,
    min = 16,
    max = 30;
  const x = (index: number) =>
    series.length === 1
      ? left + (width - left - right) / 2
      : left + (index * (width - left - right)) / (series.length - 1);
  const y = (value: number) => top + ((max - value) * (height - top - bottom)) / (max - min);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Pontuação total do MEEM por avaliação"
    >
      {[18, 22, 26, 30].map((value) => (
        <g key={value}>
          <line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">
            {value}
          </text>
        </g>
      ))}
      {series.length > 1 && (
        <polyline
          className="ln"
          points={series.map((entry, index) => `${x(index)},${y(entry.total)}`).join(' ')}
        />
      )}
      {series.map((entry, index) => (
        <g key={entry.date}>
          <circle
            className={`pt ${index === series.length - 1 ? 'last' : ''}`}
            cx={x(index)}
            cy={y(entry.total)}
            r="6"
          />
          <text className="val" x={x(index)} y={y(entry.total) - 12} textAnchor="middle">
            {entry.total}
          </text>
          <text x={x(index)} y={height - 12} textAnchor="middle">
            {entry.date}
          </text>
        </g>
      ))}
    </svg>
  );
}

function EvolutionPage() {
  const { patient, id } = usePatientContext();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['evolution', id],
    queryFn: () => client<Evolution>(`/patients/${id}/evolution`),
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const freshDate = useUIStore((state) => state.justConfirmed[id]);
  const update = useMutation({
    mutationFn: ({
      key,
      patch,
    }: {
      key: string;
      patch: { status?: string; customText?: string };
    }) =>
      client(`/patients/${id}/suggestions/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: jsonBody(patch),
      }),
    onSuccess: async () => {
      setEditingKey(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['evolution', id] }),
        queryClient.invalidateQueries({ queryKey: ['routines'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: setError,
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorNote error={query.error} />;
  const evolution = query.data!;
  const series = evolution.series ?? [];
  const action = (key: string, status: 'open' | 'ok' | 'no') =>
    update.mutate({ key, patch: { status } });
  return (
    <div className="stack">
      {evolution.hasPending && (
        <div
          className="note warn"
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            Há 1 ficha nova ({shortDate(evolution.pendingDate ?? '')}) aguardando conferência. A
            evolução abaixo ainda não a inclui.
          </span>
          <Link className="btn small" to={`/pacientes/${id}`}>
            Conferir ficha
          </Link>
        </div>
      )}
      {series.length === 0 ? (
        <div className="panel">
          <h2>Ainda não há avaliações</h2>
          <p className="muted" style={{ marginBottom: 14 }}>
            Envie a primeira ficha deste paciente para ver a evolução e receber sugestões.
          </p>
          <Link className="btn primary" to={`/pacientes/${id}`}>
            Ir para as fichas
          </Link>
        </div>
      ) : (
        <>
          <div className="panel">
            <h2>Evolução do total (MEEM)</h2>
            <div className="chartbox">{chart(series)}</div>
            <p className="srcnote">
              Pontuação de 0 a 30. Dados fictícios de exemplo.
              {series.length === 1
                ? ' Esta é a primeira avaliação; a comparação começa na próxima ficha.'
                : ''}
            </p>
          </div>
          {evolution.delta && (
            <div className="panel">
              <h2>O que mudou desde a avaliação anterior</h2>
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr>
                      <th>Domínio</th>
                      <th className="num">{evolution.delta.previousDate}</th>
                      <th className="num">{evolution.delta.lastDate}</th>
                      <th>Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolution.delta.rows.map((row) => (
                      <tr key={row.domain}>
                        <td>{row.name}</td>
                        <td className="num">
                          {row.previous}/{row.max}
                        </td>
                        <td className="num">
                          {row.last}/{row.max}
                        </td>
                        <td>
                          <span
                            className={`chip ${row.kind === 'up' ? 'up' : row.kind === 'down' ? 'down' : ''}`}
                          >
                            {row.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <ErrorNote error={error || update.error} />
          <div>
            <h2 style={{ marginBottom: 12 }}>Sugestões para a rotina</h2>
            <div className="stack" style={{ gap: 12 }}>
              {evolution.suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.key}
                  suggestion={suggestion}
                  patient={patient}
                  freshDate={freshDate}
                  editing={editingKey === suggestion.key}
                  editText={editText}
                  setEditText={setEditText}
                  startEdit={() => {
                    setEditingKey(suggestion.key);
                    setEditText(suggestion.state.customText ?? suggestion.defaultText);
                  }}
                  cancelEdit={() => setEditingKey(null)}
                  saveEdit={() =>
                    update.mutate({ key: suggestion.key, patch: { customText: editText } })
                  }
                  onStatus={(status) => action(suggestion.key, status)}
                />
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Rotina planejada</h2>
            {evolution.routine.length ? (
              <ul className="routine">
                {evolution.routine.map((item) => (
                  <li key={item.key}>
                    <span>{item.title}</span>
                    <span className="muted">
                      {item.duration} · {item.frequency}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Aceite sugestões para montar a rotina da semana deste paciente.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  patient,
  freshDate,
  editing,
  editText,
  setEditText,
  startEdit,
  cancelEdit,
  saveEdit,
  onStatus,
}: {
  suggestion: Suggestion;
  patient: Patient;
  freshDate: string | undefined;
  editing: boolean;
  editText: string;
  setEditText: (value: string) => void;
  startEdit: () => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  onStatus: (status: 'open' | 'ok' | 'no') => void;
}) {
  const state = s.state;
  const text = state.customText ?? s.defaultText;
  const fresh = Boolean(s.fell && s.lastDate && freshDate === s.lastDate);
  return (
    <div className={`sug ${state.status === 'ok' ? 'ok' : state.status === 'no' ? 'no' : ''}`}>
      <div className="row">
        <h3>{s.title}</h3>
        {fresh && <span className="chip acc">Nova com a ficha de {shortDate(s.lastDate!)}</span>}
        {state.status === 'ok' && <span className="chip up">Na rotina</span>}
        {state.status === 'no' && <span className="chip">Recusada</span>}
      </div>
      {state.status === 'no' ? (
        <div className="actions">
          <button className="btn small" onClick={() => onStatus('open')}>
            Desfazer
          </button>
        </div>
      ) : editing ? (
        <>
          <div className="edit">
            <label className="muted" htmlFor={`edit-${s.key}`}>
              Ajuste a atividade
            </label>
            <textarea
              id={`edit-${s.key}`}
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn primary small" onClick={saveEdit}>
              Salvar
            </button>
            <button className="btn small" onClick={cancelEdit}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{text}</p>
          <p className="muted">
            {s.duration} · {s.frequency}
          </p>
          {patient.interests && (
            <p className="muted">Para personalizar (perfil do paciente): {patient.interests}</p>
          )}
          <div className="why">
            <b>Por que esta sugestão:</b> {s.why}{' '}
            <span className="row" style={{ marginTop: 6 }}>
              Fonte:{' '}
              {s.sources.map((date) => (
                <span className="src" key={date}>
                  avaliação {date}
                </span>
              ))}
            </span>
          </div>
          <div className="actions">
            {state.status === 'ok' ? (
              <button className="btn small" onClick={() => onStatus('open')}>
                Tirar da rotina
              </button>
            ) : (
              <button className="btn primary small" onClick={() => onStatus('ok')}>
                Aceitar
              </button>
            )}
            <button className="btn small" onClick={startEdit}>
              Editar
            </button>
            {state.status !== 'ok' && (
              <button className="btn small" onClick={() => onStatus('no')}>
                Recusar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HomePage() {
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
        <div className={`kpi ${kpi.pendingFichas ? 'warn' : ''}`}>
          <b>{kpi.pendingFichas}</b>
          <span>Fichas aguardando conferência</span>
        </div>
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
                      to={`/pacientes/${item.patientId}${item.targetTab === 'evolucao' ? '/evolucao' : ''}`}
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
                Nada pendente. Envie uma nova ficha em um paciente para atualizar a evolução.
              </p>
            </div>
          )}
        </div>
        <div className="guide" style={{ marginBottom: 0 }}>
          <b>Roteiro do demo (2 minutos)</b>
          <ol>
            <li>Abra um paciente e clique em Enviar nova ficha.</li>
            <li>Peça a extração, confira os campos e a fonte de cada um.</li>
            <li>Confirme a ficha e veja a evolução se atualizar.</li>
            <li>Aceite, edite ou recuse as sugestões e monte a rotina.</li>
          </ol>
        </div>
      </div>
    </>
  );
}

function RoutinesPage() {
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
                      <b>{activity.title}</b>
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

function UsersPage() {
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      client<{
        items: Array<{ username: string; name: string; role: string; patientCount: number }>;
      }>('/users'),
  });
  const leads = useQuery({
    queryKey: ['leads'],
    queryFn: () =>
      client<{
        items: Array<{
          name: string;
          phone: string;
          email: string;
          profile: string;
          workplace: string;
          username: string;
          createdAt: string;
        }>;
      }>('/leads'),
  });
  if (users.isLoading || leads.isLoading) return <Loading />;
  if (users.error || leads.error) return <ErrorNote error={users.error || leads.error} />;
  return (
    <>
      <div className="head">
        <h1>Usuários</h1>
        <p className="muted">
          Quem tem acesso ao sistema e quantos pacientes cada um acompanha. Apenas administradores
          veem esta tela.
        </p>
      </div>
      <div className="panel">
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th className="num">Pacientes</th>
              </tr>
            </thead>
            <tbody>
              {users.data!.items.map((user) => (
                <tr key={user.username}>
                  <td>{user.name}</td>
                  <td>{user.username}</td>
                  <td>{user.role === 'admin' ? 'Administrador' : 'Profissional'}</td>
                  <td className="num">{user.patientCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="head" style={{ marginTop: 28 }}>
        <h2>Pedidos de teste ("Quero testar")</h2>
        <p className="muted">
          Contatos deixados na tela de login. Só o dono da página vê esta lista.
        </p>
      </div>
      {leads.data!.items.length ? (
        <div className="panel">
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Usuário</th>
                  <th>Atuação</th>
                  <th>Local</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {leads.data!.items.map((lead) => (
                  <tr key={`${lead.username}-${lead.createdAt}`}>
                    <td>{lead.name}</td>
                    <td>{lead.phone}</td>
                    <td>{lead.email}</td>
                    <td>{lead.username}</td>
                    <td>{lead.profile}</td>
                    <td>{lead.workplace}</td>
                    <td>{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel">
          <p className="muted">Nenhum pedido recebido ainda.</p>
        </div>
      )}
    </>
  );
}

function AdminOnly() {
  const session = useUIStore((state) => state.session)!;
  return session.user.role === 'admin' ? <UsersPage /> : <Navigate to="/" replace />;
}

function RouterContent() {
  const session = useUIStore((state) => state.session);
  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="login" />
            </PublicLayout>
          )
        }
      />
      <Route
        path="/cadastro"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="signup" />
            </PublicLayout>
          )
        }
      />
      <Route
        path="/quero-testar"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="trial" />
            </PublicLayout>
          )
        }
      />
      <Route element={<Protected />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/pacientes" element={<PatientList />} />
        <Route path="/pacientes/novo" element={<PatientFormPage />} />
        <Route path="/pacientes/:id/editar" element={<PatientFormPage editing />} />
        <Route path="/pacientes/:id" element={<PatientFrame />}>
          <Route index element={<PatientFichas />} />
          <Route path="evolucao" element={<EvolutionPage />} />
          <Route path="dados" element={<PatientDataPage />} />
        </Route>
        <Route path="/rotinas" element={<RoutinesPage />} />
        <Route path="/usuarios" element={<AdminOnly />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return <RouterContent />;
}
