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

test('RN-AUTH-01/RN-PAT-01/RN-FIC-03..08/RN-EVO-03..07: demo principal mantém fluxo e dados do protótipo', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha').fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: /Administrador/ })).toBeVisible();
  await expect(page.getByText('Pacientes no sistema')).toBeVisible();
  await expect(page.getByText('3', { exact: true })).toBeVisible();
  await expect(page.getByText('Profissionais cadastrados')).toBeVisible();
  await expect(page.getByText('Pacientes com queda recente')).toBeVisible();

  await page.getByRole('link', { name: 'Pacientes', exact: true }).click();
  await expect(page.getByRole('link', { name: /014 M\.S\., 78 anos/ })).toBeVisible();
  await page.getByRole('link', { name: /014 M\.S\., 78 anos/ }).click();
  await expect(page.getByRole('heading', { name: /Paciente 014/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar nova ficha' }).click();
  await expect(page.getByText('Recebendo a ficha…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extrair dados com IA' })).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole('button', { name: 'Extrair dados com IA' }).click();
  await expect(page.getByText('Extraindo…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dados extraídos' })).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByText('A soma dos domínios (22) confere com o total escrito na ficha (22/30).'),
  ).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Confirmar ficha e atualizar evolução' });
  await expect(confirm).toBeDisabled();
  await page.getByRole('button', { name: 'Está correto' }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByRole('heading', { name: 'Evolução do total (MEEM)' })).toBeVisible();
  await expect(page.getByText('Nova com a ficha de', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar' }).first().click();
  await expect(page.getByText('Na rotina').first()).toBeVisible();
  await page.getByRole('link', { name: 'Rotinas', exact: true }).click();
  await expect(page.getByText('014 · M.S., 78 anos')).toBeVisible();
});

test('RN-PAT-02/RN-PAT-04/RN-PAT-07/RN-PAT-08: cria e exclui paciente sem avaliações', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByRole('link', { name: 'Novo paciente', exact: true }).click();
  await page.getByLabel('Iniciais *').fill('K.K.');
  await page.getByLabel('Idade *').fill('70');
  await page.getByLabel('Nome *').fill('Contato fictício');
  await page.getByLabel('Telefone *').fill('32988887777');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Nenhuma ficha enviada ainda.')).toBeVisible();
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
  await page.getByLabel('Senha').fill('5678');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Agata|Ágata/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByLabel('Usuário').fill('admin');
  await page.getByLabel('Senha').fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Usuários', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ágata Souza' })).toHaveCount(2);
  await expect(page.getByRole('cell', { name: 'agata', exact: true })).toHaveCount(2);
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
  await page.getByLabel('Senha').fill('admin');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Administrador/ })).toBeVisible();
}
