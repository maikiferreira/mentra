// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Patient } from './api';
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
  evaluationCount: 0,
};
function meemEvolution(series: Array<{ date: string; total: number }>) {
  const last = series.at(-1)!;
  return {
    key: 'meem',
    name: 'Mini Exame do Estado Mental (MEEM)',
    shortName: 'MEEM',
    category: 'cognicao',
    max: 30,
    higherIsBetter: true,
    totalLabel: 'Total',
    series,
    latest: {
      date: last.date,
      total: last.total,
      max: 30,
      level: 'ok',
      label: 'Dentro do esperado.',
    },
    trend: { kind: 'first', label: 'primeira avaliação', delta: null, tone: 'neutral' },
  };
}
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
          lastResult: null,
          trend: { kind: 'none', label: 'sem avaliações', delta: null, tone: 'neutral' },
        },
      ],
    });
  if (route === '/patients/014') return response(patient);
  if (route === '/patients/014/fichas') return response({ evaluations: [] });
  if (route === '/dashboard/summary')
    return response({
      greetingName: user.name,
      kpis: { patients: 0, recentDrops: 0, routineActivities: 0 },
      todo: [],
    });
  if (route === '/patients/014/evolution')
    return response({
      instruments: [meemEvolution([{ date: '17/10/2026', total: 26 }])],
      latestInstrument: 'meem',
      suggestions: [],
      routine: [],
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
          kpis: { patients: 0, recentDrops: 0, routineActivities: 0 },
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
    expect(localStorage.getItem('mente-ativa-session')).toBeNull();
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
        'Identifique o paciente só por iniciais. Endereço e telefone exigem o consentimento do paciente (LGPD).',
      ),
    ).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe as iniciais do paciente.');
  });

  it('RN-FIC-01..05: registra ficha do MEEM pelo menu Cognição com total automático', async () => {
    let submitted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/patients/014/fichas' && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ evaluation: { date: '17/10/2026', total: 26 } }, 201);
      }
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014');
    await actor.click(await screen.findByRole('button', { name: 'Registrar nova ficha' }));
    expect(screen.getByRole('tab', { name: 'Cognição' })).toHaveAttribute('aria-selected', 'true');
    await actor.click(screen.getByRole('button', { name: /^MEEM/ }));
    const save = screen.getByRole('button', { name: 'Salvar ficha e atualizar evolução' });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Data da avaliação')).toHaveValue(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    );
    fireEvent.change(screen.getByLabelText('Data da avaliação'), {
      target: { value: '2026-10-17' },
    });
    await actor.type(screen.getByLabelText('Orientação temporal e espacial (máx. 10)'), '9');
    await actor.type(screen.getByLabelText('Memória imediata (registro) (máx. 3)'), '3');
    await actor.type(screen.getByLabelText('Atenção e cálculo (máx. 5)'), '4');
    await actor.type(screen.getByLabelText('Evocação (máx. 3)'), '2');
    const language = screen.getByLabelText('Linguagem e praxia construtiva (máx. 9)');
    await actor.type(language, '12');
    expect(screen.getByText('Use um número inteiro de 0 a 9.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await actor.clear(language);
    await actor.type(language, '8');
    // Escolaridade 4 anos: nota de corte 25 do e-book.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Total: 26/30 · Dentro do esperado para a escolaridade (nota de corte 25).',
    );
    expect(save).toBeEnabled();
    await actor.type(screen.getByLabelText('Observações'), 'Colaborou bem.');
    await actor.click(save);
    expect(
      await screen.findByRole('heading', { name: 'Evolução do total (MEEM)' }),
    ).toBeInTheDocument();
    expect(submitted).toEqual({
      instrument: 'meem',
      date: '2026-10-17',
      scores: { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 },
      observations: 'Colaborou bem.',
    });
  });

  it('RN-TST-01: menu Humor › GDS-15 pontua as respostas do e-book e envia a ficha', async () => {
    let submitted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/patients/014/fichas' && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return response({ evaluation: { date: '17/10/2026', total: 10 } }, 201);
      }
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014');
    await actor.click(await screen.findByRole('button', { name: 'Registrar nova ficha' }));
    await actor.click(screen.getByRole('tab', { name: 'Humor' }));
    expect(screen.queryByRole('button', { name: /^MEEM/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ansiedade geriátrica/ })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: /^GDS-15/ }));
    expect(screen.getByRole('heading', { name: 'Nova ficha · GDS-15' })).toBeInTheDocument();
    const questions = screen.getAllByRole('group');
    expect(questions).toHaveLength(15);
    for (const question of questions.slice(0, 14))
      await actor.click(within(question).getByLabelText('Sim'));
    expect(screen.getByRole('status')).toHaveTextContent('responda todos os itens');
    await actor.click(within(questions[14]!).getByLabelText('Sim'));
    // "Sim" em tudo: só as perguntas 1, 5, 7, 11 e 13 deixam de pontuar.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Total: 10/15 · 5 ou mais: indicativo de sintomas depressivos.',
    );
    await actor.click(screen.getByRole('button', { name: 'Salvar ficha e atualizar evolução' }));
    await waitFor(() => expect(submitted).toBeDefined());
    expect(submitted).toMatchObject({ instrument: 'gds', scores: { q1: 1, q15: 1 } });
  });

  it('RN-AUTH-03: cadastro profissional autentica e redireciona para Início', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/auth/signup') return response({ token: 'signup-token', user });
      if (route === '/auth/me') return response({ user });
      if (route === '/dashboard/summary')
        return response({
          greetingName: user.name,
          kpis: { patients: 0, recentDrops: 0, routineActivities: 0 },
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
    expect(localStorage.getItem('mente-ativa-session')).toContain('signup-token');
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
      if (route === '/patients/022/fichas') return response({ evaluations: [] });
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
    expect(await screen.findByText('Nenhuma ficha registrada ainda.')).toBeInTheDocument();
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
                  lastResult: null,
                  trend: { kind: 'none', label: 'sem avaliações', delta: null, tone: 'neutral' },
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
      instrument: 'meem',
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
          suggestions: [suggestion()],
          routine: accepted
            ? [
                {
                  key: '014:ate',
                  instrument: 'meem',
                  title: suggestion().title,
                  text: suggestion().defaultText,
                  duration: suggestion().duration,
                  frequency: suggestion().frequency,
                },
              ]
            : [],
          instruments: [
            meemEvolution([
              { date: '06/2026', total: 26 },
              { date: '09/2026', total: 23 },
            ]),
          ],
          latestInstrument: 'meem',
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
