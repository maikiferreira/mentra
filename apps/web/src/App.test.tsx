// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Patient, PendingFicha } from './api';
import { useUIStore } from './ui-store';

const user = { username: 'prof1', name: 'Profissional 1', role: 'professional' as const };
const patient: Patient = {
  id: '014',
  initials: 'M.S.',
  age: 78,
  educationYears: 4,
  interests: 'Gosta de música antiga.',
  phone: '',
  address: '',
  emergencyContact: { name: 'Contato A', phone: '32988880014', relationship: 'Filho(a)' },
  vision: 'Leve',
  hearing: 'Sem limitação',
  mobility: 'Sem limitação',
  group: 'Grupo da manhã',
  objective: 'Acompanhar',
  responsibleUsername: 'prof1',
  responsibleName: 'Profissional 1',
  hasPending: false,
  evaluationCount: 0,
};
const pending: PendingFicha = {
  date: '17/10/2026',
  scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 },
  writtenTotal: 26,
  flag: 'ate',
  observations: 'Primeira avaliação. Colaborou bem durante a sessão.',
  sheetLines: [
    { id: 'l0', title: 'Ficha de avaliação' },
    { id: 'l1', left: 'Data: 17/10/2026', right: 'Pac. 014' },
    { id: 'l2', left: 'Instrumento: MEEM' },
    { id: 'l3', left: 'Orientação', right: '9 /10' },
    { id: 'l4', left: 'Memória imediata', right: '3 /3' },
    { id: 'l5', left: 'Atenção e cálculo', right: '4 /5' },
    { id: 'l6', left: 'Evocação', right: '2 /3' },
    { id: 'l7', left: 'Linguagem', right: '8 /9' },
    { id: 'l8', left: 'Total', right: '26 /30' },
    { id: 'l9', left: 'Obs: Primeira avaliação.' },
  ],
};

function response(payload: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function mount(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function authFetch(url: string) {
  const route = new URL(url).pathname.replace('/api/v1', '');
  if (route === '/auth/me') return response({ user });
  if (route === '/patients')
    return response({
      items: [
        {
          id: '014',
          initials: 'M.S.',
          age: 78,
          group: 'Grupo da manhã',
          responsibleUsername: 'prof1',
          lastEvaluationDate: null,
          lastTotal: null,
          trend: { kind: 'none', label: 'sem avaliações', delta: null },
          hasPending: false,
        },
      ],
    });
  if (route === '/patients/014') return response(patient);
  if (route === '/patients/014/fichas') return response({ evaluations: [], pending: null });
  if (route === '/dashboard/summary')
    return response({
      greetingName: user.name,
      kpis: { patients: 0, pendingFichas: 0, recentDrops: 0, routineActivities: 0 },
      todo: [],
    });
  if (route === '/patients/014/fichas/upload') return response({ pending }, 201);
  if (route === '/patients/014/fichas/pending/confirm')
    return response(
      { justConfirmed: pending.date, evaluation: { date: pending.date, total: 26 } },
      201,
    );
  if (route === '/patients/014/evolution')
    return response({
      hasPending: false,
      pendingDate: null,
      suggestions: [],
      routine: [],
      series: [{ date: pending.date, total: 26 }],
      trend: { kind: 'first', label: 'primeira avaliação', delta: null },
    });
  return response({ error: { message: 'Not found', code: 'NOT_FOUND' } }, 404);
}

beforeEach(() => {
  localStorage.clear();
  useUIStore.getState().logout();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UI fase 5 — regras RN', () => {
  it('RN-AUTH-02/RN-AUTH-06: exibe erro literal de login, encerra sessão e retorna ao login', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/login') {
        const credentials = JSON.parse(String(init?.body)) as { password: string };
        return credentials.password === 'prof1'
          ? response({ token: 'token', user })
          : response(
              { error: { message: 'Usuário ou senha incorretos.', code: 'UNAUTHORIZED' } },
              401,
            );
      }
      if (route === '/auth/me') return response({ user });
      if (route === '/dashboard/summary')
        return response({
          greetingName: user.name,
          kpis: { patients: 0, pendingFichas: 0, recentDrops: 0, routineActivities: 0 },
          todo: [],
        });
      if (route === '/patients') return response({ items: [] });
      return response({});
    });
    const actor = userEvent.setup();
    mount('/login');
    await actor.type(screen.getByLabelText('Usuário'), 'prof1');
    await actor.type(screen.getByLabelText('Senha'), 'errada');
    await actor.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos.');
    await actor.clear(screen.getByLabelText('Senha'));
    await actor.type(screen.getByLabelText('Senha'), 'prof1');
    await actor.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(
      await screen.findByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ }),
    ).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('mentra-session')).toBeNull();
  });

  it('RN-LEAD-05: acesso de teste autentica e mostra credenciais no pop-up, fechável por Escape', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/trial-access')
        return response(
          {
            token: 'trial-token',
            user: { username: 'agata', name: 'Ágata Souza', role: 'professional' },
            credentials: { username: 'agata', password: '5678' },
          },
          201,
        );
      return authFetch(String(input));
    });
    const actor = userEvent.setup();
    mount('/quero-testar');
    await actor.type(screen.getByLabelText('Nome'), 'Ágata Souza');
    await actor.type(screen.getByLabelText('Telefone (WhatsApp)'), '(32) 9 1234-5678');
    await actor.type(screen.getByLabelText('E-mail'), 'agata@exemplo.com');
    await actor.click(screen.getByLabelText(/Autorizo o contato/));
    await actor.click(screen.getByRole('button', { name: 'Quero testar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('agata')).toBeInTheDocument();
    expect(within(dialog).getByText('5678')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RN-PAT-04/RN-PAT-06: formulário preserva texto de privacidade e apresenta erro de validação da API', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/me') return response({ user });
      if (route === '/patients' && init?.method === 'POST')
        return response(
          {
            error: {
              message: 'Informe as iniciais do paciente.',
              code: 'VALIDATION_ERROR',
              field: 'initials',
            },
          },
          422,
        );
      if (route === '/patients') return response({ items: [] });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/novo');
    expect(
      await screen.findByText(
        'Identifique o paciente só por iniciais. No protótipo, use dados fictícios. No produto, endereço e telefone exigem o consentimento do paciente (LGPD).',
      ),
    ).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe as iniciais do paciente.');
  });

  it('RN-FIC-03/RN-FIC-04/RN-FIC-07: espera upload de 1,1 s, três etapas e exige flag + soma para confirmar', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/me') return response({ user });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014');
    await actor.click(await screen.findByRole('button', { name: 'Enviar nova ficha' }));
    expect(await screen.findByText('Recebendo a ficha…')).toBeInTheDocument();
    expect(
      await screen.findByText('Extrair dados com IA', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Extrair dados com IA' }));
    expect(await screen.findByText('Extraindo…')).toBeInTheDocument();
    expect(await screen.findByText('Dados extraídos', {}, { timeout: 5000 })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar ficha e atualizar evolução' });
    expect(confirm).toBeDisabled();
    await actor.click(screen.getByRole('button', { name: 'Está correto' }));
    expect(confirm).toBeEnabled();
    await actor.clear(screen.getByLabelText('Orientação (máx. 10)'));
    await actor.type(screen.getByLabelText('Orientação (máx. 10)'), '8');
    expect(screen.getByRole('status')).toHaveTextContent('é diferente do total escrito');
    expect(confirm).toBeDisabled();
    await actor.clear(screen.getByLabelText('Orientação (máx. 10)'));
    await actor.type(screen.getByLabelText('Orientação (máx. 10)'), '9');
    expect(confirm).toBeEnabled();
    await actor.click(confirm);
    expect(
      await screen.findByRole('heading', { name: 'Evolução do total (MEEM)' }),
    ).toBeInTheDocument();
  }, 12000);

  it('RN-AUTH-03: cadastro profissional autentica e redireciona para Início', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/signup') return response({ token: 'signup-token', user });
      if (route === '/auth/me') return response({ user });
      if (route === '/dashboard/summary')
        return response({
          greetingName: user.name,
          kpis: { patients: 0, pendingFichas: 0, recentDrops: 0, routineActivities: 0 },
          todo: [],
        });
      if (route === '/patients') return response({ items: [] });
      return response({});
    });
    const actor = userEvent.setup();
    mount('/cadastro');
    await actor.type(screen.getByLabelText('Nome'), 'Profissional 1');
    await actor.type(screen.getByLabelText('Usuário'), 'prof1');
    await actor.type(screen.getByLabelText('Senha'), 'prof1');
    await actor.type(screen.getByLabelText('Confirmar senha'), 'prof1');
    await actor.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(
      await screen.findByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('mentra-session')).toContain('signup-token');
  });

  it('RN-PAT-02..06/RN-PAT-08: cria paciente com valores padrão, privacidade e responsável somente leitura', async () => {
    let submitted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/me') return response({ user });
      if (route === '/patients' && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response(
          { ...patient, id: '022', initials: 'K.K.', age: 70, evaluationCount: 0 },
          201,
        );
      }
      if (route === '/patients/022')
        return response({ ...patient, id: '022', initials: 'K.K.', age: 70, evaluationCount: 0 });
      if (route === '/patients') return response({ items: [] });
      if (route === '/patients/022/fichas') return response({ evaluations: [], pending: null });
      return response({});
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/novo');
    await actor.type(await screen.findByLabelText('Iniciais *'), 'K.K.');
    await actor.type(screen.getByLabelText('Idade *'), '70');
    await actor.type(screen.getByLabelText('Nome *'), 'Contato de emergência');
    await actor.type(screen.getByLabelText('Telefone *'), '32988887777');
    expect(screen.getByDisplayValue('Profissional 1')).toHaveAttribute('readonly');
    await actor.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Nenhuma ficha enviada ainda.')).toBeInTheDocument();
    expect(submitted).toMatchObject({
      initials: 'K.K.',
      age: 70,
      group: 'Individual',
      vision: 'Sem limitação',
    });
    expect(submitted).not.toHaveProperty('responsibleUsername');
  });

  it('RN-PAT-07: excluir paciente exige confirmação em dois passos e remove-o da lista', async () => {
    let deleted = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/me') return response({ user });
      if (route === '/patients/014' && init?.method === 'DELETE') {
        deleted = true;
        return response(undefined, 204);
      }
      if (route === '/patients/014') return response(patient);
      if (route === '/patients')
        return response({
          items: deleted
            ? []
            : [
                {
                  id: '014',
                  initials: 'M.S.',
                  age: 78,
                  group: 'Grupo da manhã',
                  responsibleUsername: 'prof1',
                  lastEvaluationDate: null,
                  lastTotal: null,
                  trend: { kind: 'none', label: 'sem avaliações', delta: null },
                  hasPending: false,
                },
              ],
        });
      return response({});
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014/dados');
    await actor.click(await screen.findByRole('button', { name: 'Excluir paciente' }));
    expect(
      screen.getByText(
        'Excluir o paciente 014? Isso remove as fichas, a evolução e as sugestões dele.',
      ),
    ).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Sim, excluir' })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Excluir paciente' }));
    await actor.click(screen.getByRole('button', { name: 'Sim, excluir' }));
    expect(await screen.findByText('Nenhum paciente cadastrado')).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  it('RN-EVO-05/RN-EVO-06: aceitar sugestão atualiza seu estado e a rotina persistida', async () => {
    let accepted = false;
    const suggestion = () => ({
      key: '014:ate',
      title: 'Atenção sustentada: cancelamento de figuras',
      defaultText: 'Atividade original.',
      duration: '10 min',
      frequency: '3x por semana',
      why: 'Atenção e cálculo: resultado abaixo do melhor.',
      sources: ['06/2026', '09/2026'],
      fell: true,
      lastDate: '09/2026',
      interests: patient.interests,
      state: { status: accepted ? ('ok' as const) : ('open' as const), customText: null },
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/me') return response({ user });
      if (route === '/patients/014') return response(patient);
      if (route === '/patients/014/evolution')
        return response({
          hasPending: false,
          pendingDate: null,
          suggestions: [suggestion()],
          routine: accepted
            ? [
                {
                  key: '014:ate',
                  title: suggestion().title,
                  text: suggestion().defaultText,
                  duration: suggestion().duration,
                  frequency: suggestion().frequency,
                },
              ]
            : [],
          series: [
            { date: '06/2026', total: 26 },
            { date: '09/2026', total: 23 },
          ],
          trend: { kind: 'down', label: '▼ caiu 3', delta: -3 },
        });
      if (
        decodeURIComponent(route) === '/patients/014/suggestions/014:ate' &&
        init?.method === 'PATCH'
      ) {
        accepted = JSON.parse(String(init.body)).status === 'ok';
        return response({ key: '014:ate', status: accepted ? 'ok' : 'open', customText: null });
      }
      return response({});
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014/evolucao');
    await actor.click(await screen.findByRole('button', { name: 'Aceitar' }));
    expect(await screen.findByText('Na rotina')).toBeInTheDocument();
    expect(screen.getByText('Atividade original.')).toBeInTheDocument();
    expect(accepted).toBe(true);
  });
});
