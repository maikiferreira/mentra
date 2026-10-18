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

  it('RN-FIC-06: mostra a ficha salva item a item, edita e exclui com confirmação', async () => {
    const gdsScores = Object.fromEntries([...Array(15)].map((_, index) => [`q${index + 1}`, 1]));
    const summary = {
      id: 'f1',
      date: '10/10/2026',
      dateISO: '2026-10-10',
      instrument: 'gds',
      instrumentName: 'GDS-15',
      total: 10,
      max: 15,
      level: 'attention',
      interpretation: '5 ou mais: indicativo de sintomas depressivos.',
      status: 'Registrada',
    };
    const requests: Array<{ method: string; route: string; body?: unknown }> = [];
    let deleted = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        requests.push({
          method,
          route,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
      if (route === '/patients/014/fichas')
        return response({ evaluations: deleted ? [] : [summary] });
      if (route === '/patients/014/fichas/f1' && method === 'PUT')
        return response({ evaluation: { ...summary, date: '09/10/2026', total: 9 } });
      if (route === '/patients/014/fichas/f1' && method === 'DELETE') {
        deleted = true;
        return response(undefined, 204);
      }
      if (route === '/patients/014/fichas/f1')
        return response({
          ...summary,
          scores: gdsScores,
          observations: 'Chorou ao falar da filha.',
        });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014');
    await actor.click(
      await screen.findByRole('button', { name: 'Ver ficha de GDS-15 de 10/10/2026' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Ficha · GDS-15 · 10/10/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chorou ao falar da filha.')).toBeInTheDocument();
    const firstRow = screen.getByRole('row', { name: /Você está satisfeito com a sua vida\?/ });
    expect(within(firstRow).getByText('Sim')).toBeInTheDocument();
    // "Sim" na pergunta 2 pontua (resposta em negrito); na pergunta 1, não.
    expect(within(firstRow).queryByText('pontua')).not.toBeInTheDocument();
    const secondRow = screen.getByRole('row', { name: /deixou de lado/ });
    expect(within(secondRow).getByText('pontua')).toBeInTheDocument();

    await actor.click(screen.getByRole('button', { name: 'Editar ficha' }));
    expect(screen.getByRole('heading', { name: 'Editar ficha · GDS-15' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar teste' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data da avaliação')).toHaveValue('2026-10-10');
    expect(screen.getByLabelText('Observações')).toHaveValue('Chorou ao falar da filha.');
    expect(screen.getByRole('status')).toHaveTextContent('Total: 10/15');
    const question2 = screen.getAllByRole('group')[1]!;
    await actor.click(within(question2).getByLabelText('Não'));
    expect(screen.getByRole('status')).toHaveTextContent('Total: 9/15');
    fireEvent.change(screen.getByLabelText('Data da avaliação'), {
      target: { value: '2026-10-09' },
    });
    await actor.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Ficha de 09/10/2026 atualizada. A evolução e as sugestões foram recalculadas.',
      ),
    ).toBeInTheDocument();
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      route: '/patients/014/fichas/f1',
      body: { date: '2026-10-09', scores: { ...gdsScores, q2: 0 } },
    });

    await actor.click(await screen.findByRole('button', { name: 'Excluir ficha' }));
    await actor.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(requests).toHaveLength(1);
    await actor.click(screen.getByRole('button', { name: 'Excluir ficha' }));
    await actor.click(screen.getByRole('button', { name: 'Sim, excluir ficha' }));
    expect(await screen.findByText('Nenhuma ficha registrada ainda.')).toBeInTheDocument();
    expect(requests[1]).toMatchObject({ method: 'DELETE', route: '/patients/014/fichas/f1' });
  });

  it('RN-VIS-01..03: visão geral mostra áreas, alertas cruzados e abre a ficha do teste não aplicado', async () => {
    const status = (key: string, shortName: string, latest: unknown, extra = {}) => ({
      key,
      name: shortName,
      shortName,
      latest,
      trend: { kind: latest ? 'first' : 'none', label: '', delta: null, tone: 'neutral' },
      nextDue: latest ? '2026-12-10' : null,
      overdue: false,
      ...extra,
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/patients/014/overview')
        return response({
          categories: [
            {
              key: 'cognicao',
              name: 'Cognição',
              instruments: [
                status('meem', 'MEEM', {
                  total: 21,
                  max: 30,
                  level: 'attention',
                  label: 'Abaixo da nota de corte.',
                  date: '10/09/2026',
                  dateISO: '2026-09-10',
                }),
                status('moca', 'MoCA', null),
              ],
            },
            {
              key: 'humor',
              name: 'Humor',
              instruments: [
                status(
                  'gds',
                  'GDS-15',
                  {
                    total: 7,
                    max: 15,
                    level: 'attention',
                    label: 'Sintomas.',
                    date: '10/03/2026',
                    dateISO: '2026-03-10',
                  },
                  { nextDue: '2026-06-10', overdue: true },
                ),
              ],
            },
            { key: 'funcionalidade', name: 'Funcionalidade', instruments: [] },
          ],
          alerts: [
            {
              key: 'humor-cognicao',
              level: 'attention',
              title: 'Humor alterado junto com a cognição',
              text: 'GDS-15 indica sintomas.',
              instruments: ['gds', 'meem'],
            },
          ],
        });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/pacientes/014/visao-geral');
    expect(await screen.findByText(/Humor alterado junto com a cognição/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const humor = screen.getByRole('region', { name: 'Humor' });
    expect(within(humor).getByText('Reavaliação atrasada desde 10/06/2026')).toBeInTheDocument();
    expect(screen.getByText('Reavaliar em 10/12/2026')).toBeInTheDocument();
    await actor.click(screen.getByRole('link', { name: 'Registrar MoCA' }));
    expect(await screen.findByRole('heading', { name: 'Nova ficha · MoCA' })).toBeInTheDocument();
  });

  it('RN-ROT-01..03: marca a semana na rotina, mostra a adesão e gera a versão para imprimir', async () => {
    const marks: unknown[] = [];
    let done = false;
    const routineItem = () => ({
      key: '014:gds:prazer',
      instrument: 'gds',
      title: 'Agenda de atividades prazerosas',
      text: 'Montar com a pessoa uma lista de atividades.',
      duration: '20 min',
      frequency: 'diariamente',
      weeks: [
        { week: '2026-10-05', done: true },
        { week: '2026-10-12', done },
      ],
      adherence: done ? 1 : 0.5,
    });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const route = decodeURIComponent(new URL(String(input)).pathname.replace('/api/v1', ''));
      if (route === '/routines')
        return response({
          items: [{ patientId: '014', initials: 'M.S.', age: 78, activities: [routineItem()] }],
        });
      if (route === '/patients/014/routine/014:gds:prazer/weeks/2026-10-12') {
        marks.push(JSON.parse(String(init?.body)));
        done = true;
        return response({});
      }
      if (route === '/patients/014/evolution')
        return response({
          instruments: [],
          latestInstrument: null,
          suggestions: [],
          routine: [routineItem()],
        });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    const actor = userEvent.setup();
    mount('/rotinas');
    expect(await screen.findByText('Adesão: 50% (1/2 semanas)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana de 05/10/2026: feita' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await actor.click(screen.getByLabelText('Feita nesta semana'));
    expect(await screen.findByText('Adesão: 100% (2/2 semanas)')).toBeInTheDocument();
    expect(marks).toEqual([{ done: true }]);

    await actor.click(screen.getByRole('link', { name: 'Imprimir rotina' }));
    expect(
      await screen.findByRole('heading', { name: 'Rotina de atividades' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Agenda de atividades prazerosas')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/marcar quando fizer/)).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('RN-REL-01: relatório reúne resumo por área, integração, evolução e rotina', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/patients/014/overview')
        return response({
          categories: [
            {
              key: 'humor',
              name: 'Humor',
              instruments: [
                {
                  key: 'gds',
                  shortName: 'GDS-15',
                  latest: {
                    total: 7,
                    max: 15,
                    level: 'attention',
                    label: '5 ou mais: indicativo de sintomas depressivos.',
                    date: '10/09/2026',
                    dateISO: '2026-09-10',
                    observations: 'Relata desânimo.',
                  },
                  trend: { kind: 'first', label: '', delta: null, tone: 'neutral' },
                  nextDue: '2026-12-10',
                  overdue: false,
                },
              ],
            },
          ],
          alerts: [
            {
              key: 'x',
              level: 'attention',
              title: 'Humor alterado',
              text: 'Detalhe.',
              instruments: [],
            },
          ],
        });
      if (route === '/patients/014/evolution')
        return response({
          instruments: [
            {
              ...meemEvolution([{ date: '10/09/2026', total: 7 }]),
              key: 'gds',
              name: 'Escala de Depressão Geriátrica (GDS-15)',
              shortName: 'GDS-15',
              max: 15,
            },
          ],
          latestInstrument: 'gds',
          suggestions: [],
          routine: [],
        });
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/pacientes/014/relatorio');
    expect(await screen.findByRole('heading', { name: 'Resumo por área' })).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /Humor GDS-15 10\/09\/2026 7\/15 Atenção/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Humor alterado\./)).toBeInTheDocument();
    expect(screen.getByText('Observações da última ficha: Relata desânimo.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma atividade na rotina até o momento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir ou salvar em PDF' })).toBeInTheDocument();
  });

  it('login permite mostrar e ocultar a senha digitada', async () => {
    const actor = userEvent.setup();
    mount('/login');
    const password = screen.getByLabelText('Senha');
    await actor.type(password, 'segredo');
    expect(password).toHaveAttribute('type', 'password');
    await actor.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('segredo');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await actor.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(password).toHaveAttribute('type', 'password');
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
    await actor.type(screen.getByLabelText('E-mail'), 'prof1@exemplo.com');
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

const billingMe = (overrides: Record<string, unknown> = {}) => ({
  hasAccess: true,
  reason: 'trial',
  status: null,
  plan: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManage: false,
  trialEndsAt: '2026-10-25T12:00:00.000Z',
  trialDaysLeft: 3,
  payments: [],
  ...overrides,
});

describe('UI assinaturas — RN-PAY', () => {
  it('RN-PAY-01: cards de planos mostram os preços e o aviso de teste encerrado', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/billing/me')
        return response(billingMe({ hasAccess: false, reason: 'trial_expired', trialDaysLeft: 0 }));
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/assinatura/planos');
    expect(await screen.findByText(/Seu período de teste terminou/)).toBeInTheDocument();
    const monthly = screen.getByRole('article', { name: 'Mensal' });
    const annual = screen.getByRole('article', { name: 'Anual' });
    expect(within(monthly).getByText('R$ 49,90')).toBeInTheDocument();
    expect(within(annual).getByText('R$ 44,91')).toBeInTheDocument();
    expect(within(annual).getByText('R$ 538,92 cobrados anualmente')).toBeInTheDocument();
    expect(within(annual).getByText('Economize 10%')).toBeInTheDocument();
    expect(within(monthly).getByRole('button', { name: 'Escolher plano' })).toBeEnabled();
  });

  it('RN-PAY-05: resposta 402 da API redireciona para a escolha de plano', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/dashboard/summary')
        return response(
          { error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Seu acesso não está ativo.' } },
          402,
        );
      if (route === '/billing/me')
        return response(
          billingMe({ hasAccess: false, reason: 'no_subscription', trialDaysLeft: 0 }),
        );
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/');
    expect(await screen.findByRole('heading', { name: 'Planos' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Anual' })).toBeInTheDocument();
  });

  it('RN-PAY-07: tela de assinatura mostra status, próxima cobrança e histórico', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/billing/me')
        return response(
          billingMe({
            reason: 'active',
            status: 'active',
            plan: 'monthly',
            currentPeriodEnd: '2026-11-18T12:00:00.000Z',
            canManage: true,
            trialEndsAt: null,
            trialDaysLeft: 0,
            payments: [
              {
                id: 'in_2',
                amountCents: 4990,
                currency: 'brl',
                plan: 'monthly',
                status: 'failed',
                paidAt: null,
                createdAt: '2026-10-20T12:00:00.000Z',
              },
              {
                id: 'in_1',
                amountCents: 4990,
                currency: 'brl',
                plan: 'monthly',
                status: 'paid',
                paidAt: '2026-10-18T12:00:00.000Z',
                createdAt: '2026-10-18T12:00:00.000Z',
              },
            ],
          }),
        );
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/perfil/assinatura');
    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Próxima cobrança')).toBeInTheDocument();
    expect(screen.getByText('18/11/2026')).toBeInTheDocument();
    expect(screen.getByText('R$ 49,90/mês')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('Falhou')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('18/10/2026')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Pago')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar forma de pagamento' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeEnabled();
    expect(screen.getByRole('link', { name: /Assinatura/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('RN-PAY-10: página de sucesso só confirma quando a API mostra a assinatura ativa', async () => {
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/billing/me') {
        calls += 1;
        return response(
          calls === 1
            ? billingMe({ hasAccess: false, reason: 'incomplete', status: 'incomplete' })
            : billingMe({ reason: 'active', status: 'active', plan: 'annual' }),
        );
      }
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/assinatura/sucesso?session_id=cs_1');
    expect(
      await screen.findByRole('heading', { name: 'Confirmando pagamento…' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Acesso liberado!' }, { timeout: 4_000 }),
    ).toBeInTheDocument();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('RN-PAY-03: banner do teste grátis mostra os dias restantes', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const route = new URL(String(input)).pathname.replace('/api/v1', '');
      if (route === '/billing/me') return response(billingMe());
      return authFetch(String(input));
    });
    useUIStore.getState().setSession({ token: 'token', user });
    mount('/');
    const banner = await screen.findByText(/Seu teste grátis termina em/);
    expect(banner).toHaveTextContent('Seu teste grátis termina em 3 dias');
    expect(screen.getByRole('link', { name: 'Assinar agora' })).toHaveAttribute(
      'href',
      '/assinatura/planos',
    );
  });
});
