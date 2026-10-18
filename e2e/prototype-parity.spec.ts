import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000/api/v1';
let adminToken = '';

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${API}/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  expect(login.ok()).toBeTruthy();
  adminToken = (await login.json()).token as string;
  const reset = await resetDemo(request);
  expect(reset.status()).toBe(204);
});

test.afterAll(async ({ request }) => {
  if (adminToken) await resetDemo(request);
});

test('RN-AUTH-01/RN-PAT-01/RN-FIC-01..05/RN-EVO-03..07: demo principal mantém fluxo e dados do protótipo', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: /Administrador/ })).toBeVisible();
  await expect(page.locator('.kpi', { hasText: 'Pacientes no sistema' })).toContainText('3');
  await expect(page.getByText('Profissionais cadastrados')).toBeVisible();
  await expect(page.getByText('Pacientes com queda recente')).toBeVisible();

  await page.getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(page.getByRole('link', { name: /014 Maria Souza, 78 anos/ })).toBeVisible();
  await page.getByRole('link', { name: /014 Maria Souza, 78 anos/ }).click();
  await expect(page.getByRole('heading', { name: /Paciente 014/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar nova ficha' }).click();
  await page.getByRole('button', { name: /^MEEM/ }).click();
  const save = page.getByRole('button', { name: 'Salvar ficha e atualizar evolução' });
  await expect(save).toBeDisabled();
  await page.getByLabel('Orientação temporal e espacial (máx. 10)').fill('8');
  await page.getByLabel('Memória imediata (registro) (máx. 3)').fill('3');
  await page.getByLabel('Atenção e cálculo (máx. 5)').fill('2');
  await page.getByLabel('Evocação (máx. 3)').fill('1');
  await page.getByLabel('Linguagem e praxia construtiva (máx. 9)').fill('8');
  await expect(page.getByRole('status')).toContainText('Total: 22/30');
  await page.getByLabel('Observações').fill('Relata cansaço.');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByRole('heading', { name: 'Evolução do total (MEEM)' })).toBeVisible();
  await expect(page.getByText('Nova com a ficha de', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar' }).first().click();
  await expect(page.getByText('Na rotina').first()).toBeVisible();
  await page.getByRole('link', { name: 'Rotinas', exact: true }).click();
  await expect(page.getByText('014 · Maria Souza, 78 anos')).toBeVisible();
});

test('RN-PAT-02/RN-PAT-04/RN-PAT-07/RN-PAT-08: cria e exclui paciente sem avaliações', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Novo paciente', exact: true }).click();
  await page.getByLabel('Nome completo *').fill('Kátia Kunz');
  await page.getByLabel('Idade *').fill('70');
  await page.getByLabel('Nome *').fill('Contato fictício');
  await page.getByLabel('Telefone *').fill('32988887777');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Nenhuma ficha registrada ainda.')).toBeVisible();
  await page.getByRole('tab', { name: 'Dados do paciente' }).click();
  await page.getByRole('button', { name: 'Excluir paciente' }).click();
  await page.getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.getByText('Nenhum paciente cadastrado')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible();
});

test('RN-LEAD-01..06: cria acesso de teste, mostra pop-up e registra lead para admin', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Quero testar' }).click();
  await page.getByRole('button', { name: 'Quero testar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Informe seu nome.');

  await page.getByLabel('Nome').fill('Ágata Souza');
  await page.getByLabel('Telefone (WhatsApp)').fill('(32) 9 1234-5678');
  await page.getByLabel('E-mail').fill('agata@exemplo.com');
  await page.getByLabel(/Autorizo o contato/).check();
  await page.getByRole('button', { name: 'Quero testar' }).click();
  const welcome = page.getByRole('dialog');
  await expect(welcome.getByText('agata', { exact: true })).toBeVisible();
  await expect(welcome.getByText('5678', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Nenhum paciente cadastrado', { exact: false })).toHaveCount(0);
  await expect(page.getByText('0', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByLabel('Usuário').fill('agata');
  await page.getByLabel('Senha', { exact: true }).fill('5678');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Agata|Ágata/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Usuários', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ágata Souza' })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: 'agata', exact: true })).toHaveCount(2);
});

test('RN-VIS/RN-REL/RN-FIC-06: visão geral, relatório e edição de ficha com os nove testes do seed', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/pacientes/014/visao-geral');
  await expect(page.getByText('Humor alterado junto com a cognição.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Funcionalidade' })).toContainText('Pfeffer');
  await page.getByRole('link', { name: 'Gerar relatório (PDF)' }).click();
  await expect(page.getByRole('heading', { name: 'Resumo por área' })).toBeVisible();
  await expect(page.getByText('Escala de Depressão Geriátrica (GDS-15)')).toBeVisible();

  await page.goto('/pacientes/014');
  await page.getByRole('button', { name: 'Ver ficha de GDS-15 de 14/09/2026' }).click();
  await expect(
    page.getByText('Relata desânimo desde a mudança da filha para outra cidade.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await expect(page.getByRole('status')).toContainText('Total: 7/15');
  await page.getByLabel('Observações').fill('Relata desânimo; família avisada.');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Ficha de 14/09/2026 atualizada.', { exact: false })).toBeVisible();
  await expect(page.getByText('Relata desânimo; família avisada.')).toBeVisible();
});

test('RN-AUTH-04: navegação mobile e tokens de tema acompanham preferências do dispositivo', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.locator('.side nav')).toHaveCSS('flex-direction', 'row');
  await page.emulateMedia({ colorScheme: 'dark' });
  const background = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--bg').trim());
  expect(background).toBe('#0e191c');
});

async function resetDemo(request: APIRequestContext) {
  return request.post(`${API}/demo/reset`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Administrador/ })).toBeVisible();
}
