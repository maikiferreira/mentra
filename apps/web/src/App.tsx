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
  PATIENT_GROUPS,
  INSTRUMENT_CATEGORIES,
  INSTRUMENTS,
  TRIAL_PROFILES,
  evaluateInstrument,
  getInstrument,
  type InstrumentCategory,
  type InstrumentDefinition,
  type InstrumentField,
  type InstrumentKey,
  type InstrumentScores,
  type ResultLevel,
  type TrendResult,
} from '@mente-ativa/shared';
import logo from './assets/logo.jpg';
import {
  api,
  jsonBody,
  onSubscriptionRequired,
  type Dashboard,
  type Evaluation,
  type Evolution,
  type InstrumentEvolution,
  type Patient,
  type PatientSummary,
  type Session,
  type Suggestion,
} from './api';
import { client } from './client';
import { useUIStore } from './ui-store';
import { PlansPage } from './pages/billing/PlansPage';
import { CheckoutSuccessPage } from './pages/billing/CheckoutSuccessPage';
import { SubscriptionSettingsPage } from './pages/billing/SubscriptionSettingsPage';
import { TrialBanner } from './pages/billing/TrialBanner';

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
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    // RN-PAY-05: sem acesso válido, qualquer 402 da API leva à escolha de plano.
    onSubscriptionRequired(() => navigate('/assinatura/planos', { replace: true }));
    return () => onSubscriptionRequired(null);
  }, [navigate]);
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
  const path = location.pathname;
  const active =
    path === '/'
      ? 'home'
      : path.startsWith('/pacientes')
        ? 'list'
        : path.startsWith('/rotinas')
          ? 'routine'
          : path.startsWith('/admin/assinaturas')
            ? 'subscriptions'
            : path.startsWith('/perfil/assinatura') || path.startsWith('/assinatura')
              ? 'billing'
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
    billing: (
      <svg viewBox="0 0 24 24">
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M6.5 15h4" />
      </svg>
    ),
    subscriptions: (
      <svg viewBox="0 0 24 24">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  };
  const nav = [
    ['home', 'Início', '/'],
    ['list', 'Pacientes', '/pacientes'],
    ['routine', 'Rotinas', '/rotinas'],
  ] as const;
  const extraNav =
    session.user.role === 'admin'
      ? ([
          ['users', 'Usuários', '/usuarios'],
          ['subscriptions', 'Assinaturas', '/admin/assinaturas'],
        ] as const)
      : ([['billing', 'Assinatura', '/perfil/assinatura']] as const);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav aria-label="Menu principal">
          {[...nav, ...extraNav].map(([key, label, to]) => (
            <Link
              className="navb"
              key={key}
              to={to}
              aria-current={active === key ? 'page' : undefined}
            >
              {icon[key]}
              <span>{label}</span>
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
      </aside>
      <div className="content">
        {session.user.role !== 'admin' && <TrialBanner />}
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
            email: values.email ?? '',
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
          {signup && input('email', 'E-mail', 'email', 'email', 'nome@exemplo.com')}
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
            <p className="muted">Identificados só por código e iniciais.</p>
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
                    {patient.lastResult
                      ? `${patient.lastResult.instrumentName} ${scoreText(patient.lastResult.total, patient.lastResult.max)}`
                      : '—'}
                  </span>
                  <span className="tr">
                    <span className={`chip ${TONE_CHIP[patient.trend.tone]}`}>
                      {patient.trend.label}
                    </span>
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
          Identifique o paciente só por iniciais. Endereço e telefone exigem o consentimento do
          paciente (LGPD).
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

const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const formatScore = (value: number) => String(value).replace('.', ',');
const scoreText = (total: number, max: number | null) =>
  max === null ? formatScore(total) : `${formatScore(total)}/${formatScore(max)}`;
const LEVEL_CHIP: Record<ResultLevel, string> = {
  ok: 'up',
  attention: 'warn',
  alert: 'down',
  info: '',
};
const LEVEL_NAME: Record<ResultLevel, string> = {
  ok: 'Esperado',
  attention: 'Atenção',
  alert: 'Alerta',
  info: 'Sem referência',
};
const TONE_CHIP: Record<TrendResult['tone'], string> = { good: 'up', bad: 'down', neutral: '' };
/** Quantidades sem máximo próprio no teste (ex.: palavras em 1 minuto). */
const MAX_COUNT = 99;

/** Rascunho do formulário: números e escolhas como texto, '' = ainda sem resposta. */
type Draft = Record<string, string>;
function initialDraft(definition: InstrumentDefinition, patient: Patient): Draft {
  return Object.fromEntries(
    definition.fields.map((field) => {
      if (field.kind !== 'check') return [field.key, ''];
      // MoCA: já marca o ponto de escolaridade quando o cadastro indica 12 anos ou menos.
      const bonus =
        definition.key === 'moca' &&
        field.key === 'esc' &&
        patient.educationYears !== null &&
        patient.educationYears <= 12;
      return [field.key, bonus ? '1' : '0'];
    }),
  );
}
function parseDraft(definition: InstrumentDefinition, draft: Draft) {
  const scores: InstrumentScores = {};
  const invalid = new Set<string>();
  let missing = 0;
  for (const field of definition.fields) {
    const raw = draft[field.key] ?? '';
    if (raw === '') {
      missing += 1;
      continue;
    }
    if (field.kind === 'number' && (!/^\d+$/.test(raw) || Number(raw) > (field.max ?? MAX_COUNT))) {
      invalid.add(field.key);
      continue;
    }
    scores[field.key] = Number(raw);
  }
  return { scores, invalid, missing };
}

function InstrumentForm({
  definition,
  patient,
  id,
  onBack,
  onCancel,
}: {
  definition: InstrumentDefinition;
  patient: Patient;
  id: string;
  onBack: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(definition, patient));
  const [observations, setObservations] = useState('');
  const parsed = parseDraft(definition, draft);
  const complete = Boolean(date) && parsed.missing === 0 && parsed.invalid.size === 0;
  const preview = evaluateInstrument(definition, parsed.scores, {
    educationYears: patient.educationYears,
  });
  const change = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      client<{ evaluation: { date: string } }>(`/patients/${id}/fichas`, {
        method: 'POST',
        body: jsonBody({ instrument: definition.key, date, scores: parsed.scores, observations }),
      }),
    onSuccess: async ({ evaluation }) => {
      useUIStore.getState().markRegistered(id, evaluation.date);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fichas', id] }),
        queryClient.invalidateQueries({ queryKey: ['patient', id] }),
        queryClient.invalidateQueries({ queryKey: ['patients'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['evolution', id] }),
      ]);
      navigate(`/pacientes/${id}/evolucao`, { state: { instrument: definition.key } });
    },
  });
  // Seções com mais de um campo viram blocos com título (ex.: Contorno, Números do relógio).
  const grouped = definition.sections.length > 1;
  const questionNumber = new Map(
    definition.fields
      .filter((field) => field.kind === 'choice')
      .map((field, index) => [field.key, index + 1]),
  );
  const renderField = (field: InstrumentField) => {
    const value = draft[field.key] ?? '';
    if (field.kind === 'check')
      return (
        <label className="fld-check" key={field.key}>
          <input
            type="checkbox"
            checked={value === '1'}
            onChange={(event) => change(field.key, event.target.checked ? '1' : '0')}
          />
          <span>{field.label}</span>
        </label>
      );
    if (field.kind === 'choice') {
      return (
        <fieldset className="fld-choice" key={field.key}>
          <legend>
            {questionNumber.get(field.key)}. {field.label}
          </legend>
          <div
            className={`opts ${field.options!.some((option) => option.description) ? 'long' : ''}`}
          >
            {field.options!.map((option) => (
              <label
                className={`opt ${value === String(option.value) ? 'on' : ''}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name={`f-${field.key}`}
                  value={option.value}
                  checked={value === String(option.value)}
                  onChange={() => change(field.key, String(option.value))}
                />
                <span>
                  <b>{option.label}</b>
                  {option.description && <small>{option.description}</small>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    const invalid = parsed.invalid.has(field.key);
    const max = field.max ?? MAX_COUNT;
    return (
      <div className={`fld ${invalid ? 'invalid' : ''}`} key={field.key}>
        <div>
          <label htmlFor={`f-${field.key}`}>
            {field.label}
            {field.max !== undefined ? ` (máx. ${field.max})` : ''}
          </label>
          {invalid && <small>Use um número inteiro de 0 a {max}.</small>}
        </div>
        <input
          id={`f-${field.key}`}
          type="number"
          inputMode="numeric"
          required
          min={0}
          max={max}
          step={1}
          aria-invalid={invalid}
          value={value}
          onChange={(event) => change(field.key, event.target.value)}
        />
      </div>
    );
  };
  return (
    <form
      className="panel"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) save.mutate();
      }}
    >
      <div className="head-row">
        <h2>Nova ficha · {definition.shortName}</h2>
        <button className="btn small" type="button" onClick={onBack}>
          Trocar teste
        </button>
      </div>
      <p className="muted">{definition.name}</p>
      <p className="srcnote" style={{ marginBottom: 14 }}>
        {definition.instructions}
      </p>
      <div className="fields">
        <ErrorNote error={save.error} />
        <div className="fld wide">
          <label htmlFor="f-date">Data da avaliação</label>
          <input
            id="f-date"
            type="date"
            required
            max={todayISO()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {grouped
          ? definition.sections.map((section) => {
              const fields = definition.fields.filter((field) => field.section === section.key);
              return fields.length > 1 ? (
                <fieldset className="fgroup" key={section.key}>
                  <legend>{section.name}</legend>
                  {fields.map(renderField)}
                </fieldset>
              ) : (
                fields.map(renderField)
              );
            })
          : null}
        {/* Campos fora das seções resumidas (ex.: ponto de escolaridade do MoCA) ou testes de seção única. */}
        {definition.fields
          .filter(
            (field) =>
              !grouped || !definition.sections.some((section) => section.key === field.section),
          )
          .map(renderField)}
        <div
          className={`note ${complete ? (LEVEL_CHIP[preview.level] === 'up' ? 'ok' : preview.level === 'info' ? '' : 'warn') : ''}`}
          role="status"
        >
          <b>
            {definition.totalLabel}: {scoreText(preview.total, preview.max)}
          </b>
          {complete
            ? ` · ${preview.label}`
            : ` · ${parsed.missing ? 'responda todos os itens' : 'corrija os campos destacados'}`}
        </div>
        <div className="obs">
          <label htmlFor="f-obs">Observações</label>
          <textarea
            id="f-obs"
            maxLength={2000}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!complete || save.isPending}>
            Salvar ficha e atualizar evolução
          </button>
          <button className="btn" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        {!complete && (
          <p className="srcnote">Preencha a data e todos os itens do teste para salvar.</p>
        )}
      </div>
    </form>
  );
}

function NewFicha({
  patient,
  id,
  onCancel,
}: {
  patient: Patient;
  id: string;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<InstrumentCategory>('cognicao');
  const [instrument, setInstrument] = useState<InstrumentKey | null>(null);
  const definition = instrument ? getInstrument(instrument) : undefined;
  if (definition)
    return (
      <InstrumentForm
        key={definition.key}
        definition={definition}
        patient={patient}
        id={id}
        onBack={() => setInstrument(null)}
        onCancel={onCancel}
      />
    );
  return (
    <div className="panel">
      <h2>Nova ficha</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Escolha a área e o teste aplicado ao paciente.
      </p>
      <div className="seg" role="tablist" aria-label="Áreas de avaliação">
        {INSTRUMENT_CATEGORIES.map((entry) => (
          <button
            type="button"
            role="tab"
            className="segb"
            key={entry.key}
            aria-selected={category === entry.key}
            onClick={() => setCategory(entry.key)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="tests" role="tabpanel">
        {INSTRUMENTS.filter((entry) => entry.category === category).map((entry) => (
          <button
            type="button"
            className="testb"
            key={entry.key}
            onClick={() => setInstrument(entry.key)}
          >
            <b>{entry.shortName}</b>
            <span className="muted">{entry.summary}</span>
          </button>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PatientFichas() {
  const { id, patient } = usePatientContext();
  const [formOpen, setFormOpen] = useState(false);
  const justRegistered = useUIStore((state) => state.justRegistered[id]);
  const fichasQuery = useQuery({
    queryKey: ['fichas', id],
    queryFn: () => client<{ evaluations: Evaluation[] }>(`/patients/${id}/fichas`),
  });
  if (fichasQuery.isLoading) return <Loading />;
  if (fichasQuery.error) return <ErrorNote error={fichasQuery.error} />;
  const evaluations = fichasQuery.data?.evaluations ?? [];
  return (
    <div className="stack">
      {justRegistered && (
        <div className="note ok">
          Ficha de {shortDate(justRegistered)} registrada. A evolução e as sugestões foram
          atualizadas.
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
                  <th>Teste</th>
                  <th className="num">Resultado</th>
                  <th>Interpretação</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={`${evaluation.instrument}-${evaluation.date}`}>
                    <td>{evaluation.date}</td>
                    <td>{evaluation.instrumentName}</td>
                    <td className="num">{scoreText(evaluation.total, evaluation.max)}</td>
                    <td>
                      <span className={`chip ${LEVEL_CHIP[evaluation.level]}`}>
                        {LEVEL_NAME[evaluation.level]}
                      </span>{' '}
                      <span className="muted interp">{evaluation.interpretation}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhuma ficha registrada ainda.</p>
        )}
      </div>
      {formOpen ? (
        <NewFicha patient={patient} id={id} onCancel={() => setFormOpen(false)} />
      ) : (
        <div className="drop">
          <h3>Registrar nova ficha</h3>
          <p className="muted">
            Testes de cognição (MEEM, MoCA, Relógio, Fluência verbal), humor (GDS-15, Ansiedade
            geriátrica) e funcionalidade (Pfeffer, Katz, CDR).
          </p>
          <div>
            <button className="btn primary" onClick={() => setFormOpen(true)}>
              Registrar nova ficha
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

function chart(instrument: InstrumentEvolution) {
  const series = instrument.series;
  const width = 560,
    height = 230,
    left = 40,
    right = 44,
    top = 16,
    bottom = 36;
  const values = series.map((entry) => entry.total);
  // Teto: máximo do teste; sem máximo (fluência), um pouco acima do maior valor.
  const max = instrument.max ?? Math.max(10, Math.ceil((Math.max(...values) * 1.25) / 5) * 5);
  // MEEM: aproxima o eixo da faixa usual, sem cortar valores baixos.
  const min =
    instrument.key === 'meem'
      ? Math.max(0, Math.min(16, Math.floor(Math.min(...values) / 2) * 2 - 2))
      : 0;
  // Marcações em números redondos (meio ponto em escalas curtas, como a CDR).
  const step = max - min >= 8 ? 1 : 0.5;
  const ticks = [
    ...new Set(
      [1, 2, 3, 4].map((index) => Math.round((min + ((max - min) * index) / 4) / step) * step),
    ),
  ];
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
      aria-label={`${instrument.totalLabel} do ${instrument.shortName} por avaliação`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">
            {formatScore(value)}
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
            {formatScore(entry.total)}
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['evolution', id],
    queryFn: () => client<Evolution>(`/patients/${id}/evolution`),
  });
  const [selected, setSelected] = useState<InstrumentKey | null>(
    (location.state as { instrument?: InstrumentKey } | null)?.instrument ?? null,
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const freshDate = useUIStore((state) => state.justRegistered[id]);
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
  const current =
    evolution.instruments.find((entry) => entry.key === selected) ??
    evolution.instruments.find((entry) => entry.key === evolution.latestInstrument) ??
    evolution.instruments[0];
  const suggestions = evolution.suggestions.filter(
    (suggestion) => suggestion.instrument === current?.key,
  );
  const action = (key: string, status: 'open' | 'ok' | 'no') =>
    update.mutate({ key, patch: { status } });
  if (!current)
    return (
      <div className="panel">
        <h2>Ainda não há avaliações</h2>
        <p className="muted" style={{ marginBottom: 14 }}>
          Registre a primeira ficha deste paciente para ver a evolução e receber sugestões.
        </p>
        <Link className="btn primary" to={`/pacientes/${id}`}>
          Ir para as fichas
        </Link>
      </div>
    );
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Testes aplicados">
        {evolution.instruments.map((entry) => (
          <button
            type="button"
            role="tab"
            className="segb"
            key={entry.key}
            aria-selected={entry.key === current.key}
            onClick={() => setSelected(entry.key)}
          >
            {entry.shortName}{' '}
            <span className={`chip ${LEVEL_CHIP[entry.latest.level]}`}>
              {scoreText(entry.latest.total, entry.latest.max)}
            </span>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="head-row">
          <h2>Evolução do total ({current.shortName})</h2>
          <span className={`chip ${TONE_CHIP[current.trend.tone]}`}>{current.trend.label}</span>
        </div>
        <div className="chartbox">{chart(current)}</div>
        <div
          className={`note ${LEVEL_CHIP[current.latest.level] === 'up' ? 'ok' : current.latest.level === 'info' ? '' : 'warn'}`}
        >
          <b>
            Último resultado ({current.latest.date}):{' '}
            {scoreText(current.latest.total, current.latest.max)}
          </b>{' '}
          · {current.latest.label}
        </div>
        <p className="srcnote">
          {current.name}.{' '}
          {current.higherIsBetter
            ? 'Quanto maior a pontuação, melhor o desempenho.'
            : 'Quanto maior a pontuação, maior o comprometimento.'}
          {current.series.length === 1
            ? ' Esta é a primeira avaliação; a comparação começa na próxima ficha.'
            : ''}
        </p>
      </div>
      {current.delta && (
        <div className="panel">
          <h2>O que mudou desde a avaliação anterior</h2>
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>{current.delta.rows.length > 1 ? 'Item' : 'Pontuação'}</th>
                  <th className="num">{current.delta.previousDate}</th>
                  <th className="num">{current.delta.lastDate}</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                {current.delta.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td className="num">{scoreText(row.previous, row.max)}</td>
                    <td className="num">{scoreText(row.last, row.max)}</td>
                    <td>
                      <span className={`chip ${TONE_CHIP[row.tone]}`}>{row.label}</span>
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
        <h2 style={{ marginBottom: 12 }}>Sugestões para a rotina ({current.shortName})</h2>
        <div className="stack" style={{ gap: 12 }}>
          {suggestions.map((suggestion) => (
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
                <span>
                  {item.title}{' '}
                  <span className="chip">{getInstrument(item.instrument)?.shortName}</span>
                </span>
                <span className="muted">
                  {item.duration} · {item.frequency}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Aceite sugestões de qualquer teste para montar a rotina da semana deste paciente.
          </p>
        )}
      </div>
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
                Nada pendente. Registre uma nova ficha em um paciente para atualizar a evolução.
              </p>
            </div>
          )}
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

function AdminOnly({ children }: { children: ReactNode }) {
  const session = useUIStore((state) => state.session)!;
  return session.user.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
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
        <Route
          path="/usuarios"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route path="/assinatura/planos" element={<PlansPage />} />
        <Route path="/assinatura/sucesso" element={<CheckoutSuccessPage />} />
        <Route path="/perfil/assinatura" element={<SubscriptionSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return <RouterContent />;
}
