# Mente Ativa: assinaturas e pagamentos com Stripe

> Roteiro de implementação para o Claude Code. Execute **uma fase por vez**, na ordem. Ao fim de cada fase, rode `npm run test`, `npm run typecheck` e `npm run lint` e faça um commit. Não faça push nem deploy sem confirmação.

## 1. Contexto
- A aplicação está em produção no Render, com `mente-ativa-api` (Express 5 + Mongoose, rodando com `tsx`) e `mente-ativa-web` (React 18 + Vite, estático). O banco é o MongoDB Atlas (`mentra`).
- Hoje não existe nenhum código de pagamento, assinatura ou e-mail.
- O "Quero testar" (`POST /api/v1/auth/trial-access` → `AuthService.trialAccess()` em `apps/api/src/modules/identity/application/auth-service.ts`) cria um `User` com `origin:'trial'`, sem prazo de expiração. O e-mail fica só no `Lead`.
- Padrões do projeto que devem ser seguidos:
  - Módulos em `apps/api/src/modules/<ctx>/{domain,application,presentation}`; os services usam os models Mongoose direto.
  - Erros com `ApiError` em `modules/shared/kernel/errors.ts`.
  - Autenticação com `requireAuth`/`requireAdmin`/`getRequestUser` em `modules/shared/presentation/http.ts`.
  - Web com react-router 7, react-query, zustand (`ui-store.ts`) e o CSS global `styles/prototype.css`, com os tokens `--accent`, `--line`, `--surface`, `--ink`, `--muted`…
  - Testes de integração em `apps/api/src/api.integration.test.ts` (MongoMemoryServer + supertest).

## 2. Regras de negócio
| ID | Regra |
|---|---|
| RN-PAY-01 | **Mensal:** R$ 49,90/mês. **Anual:** R$ 538,92/ano (R$ 49,90 × 12 = R$ 598,80, com 10% de desconto), exibido como "R$ 44,91/mês" com o selo "Economize 10%". |
| RN-PAY-02 | Os pagamentos são com **cartão de crédito** recorrente. **Débito não entra**: no Brasil, o débito exige autenticação a cada cobrança e o Stripe não oferece débito recorrente. Cartões múltiplos (crédito e débito) funcionam pela função crédito. |
| RN-PAY-03 | O "Quero testar" dá **7 dias grátis sem cartão** (`User.trialEndsAt = createdAt + 7d`). Quem assina durante o trial é cobrado na hora, e o trial deixa de valer. |
| RN-PAY-04 | `role:'admin'` e `origin:'seed'` são **isentos**. `origin:'signup'` precisa de assinatura ativa para usar a plataforma. |
| RN-PAY-05 | Sem acesso válido, a API responde **402 `SUBSCRIPTION_REQUIRED`** e o web redireciona para `/assinatura/planos`. `/auth/*` e `/billing/*` continuam acessíveis. |
| RN-PAY-06 | O acesso é válido quando: o usuário é isento; **ou** `trialEndsAt > agora`; **ou** o status é `active`; **ou** é `past_due` há até 3 dias (carência); **ou** é `canceled` com `currentPeriodEnd > agora`. |
| RN-PAY-07 | **Troca de cartão, cancelamento e troca de plano** pelo perfil (`/perfil/assinatura`), usando o **Stripe Customer Portal**. O cancelamento vale no **fim do período pago**. |
| RN-PAY-08 | Depois do pagamento confirmado (webhook), enviar um **e-mail SMTP de acesso liberado**. Também há e-mails de boas-vindas ao trial, falha de pagamento e cancelamento. |
| RN-PAY-09 | O admin vê o painel de assinaturas (KPIs, gráficos e tabela) em `/admin/assinaturas`. |
| RN-PAY-10 | O webhook é a **fonte da verdade**. A página de sucesso nunca ativa o acesso sozinha, e os eventos são idempotentes. |

## 3. Pré-requisitos manuais (você, antes da Fase 1)
1. **Stripe** (dashboard.stripe.com), primeiro em **modo de teste**:
   - Criar o produto **"Mente Ativa"** com dois preços em BRL: **R$ 49,90 por mês** e **R$ 538,92 por ano**. Anotar os dois `price_...`.
   - Em **Settings → Billing → Customer portal**, ativar a atualização do método de pagamento, o cancelamento (*at end of billing period*) e a troca de plano entre os dois preços. Também configurar o nome do negócio, os links de termos e privacidade e o idioma.
   - Em **Developers → API keys**, copiar a `sk_test_...`.
   - Em **Developers → Webhooks → Add endpoint**, cadastrar `https://mente-ativa-api.onrender.com/api/v1/billing/webhook` (ou `https://api.menteativaa.com.br/...`, quando o domínio estiver ativo), com os eventos `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` e `customer.subscription.deleted`. Copiar o `whsec_...`.
   - Para testar localmente, instalar a Stripe CLI e rodar `stripe listen --forward-to localhost:3000/api/v1/billing/webhook`.
2. **SMTP**, recomendado o **Resend**:
   - Verificar o domínio `menteativaa.com.br`, adicionando os registros TXT/MX/DKIM que ele pedir na zona DNS do Registro.br.
   - Criar uma API key e usar `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend` e `SMTP_PASS=<api key>`.
   - Alternativa sem domínio: Brevo.

## 4. Variáveis de ambiente
Documentar no `.env.example` sem valores reais e adicionar ao `render.yaml` como `sync:false`. Todas pertencem ao serviço da API:
```
APP_URL=https://mente-ativa-web.onrender.com      # base do success_url, return_url e links nos e-mails
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
SMTP_HOST=  SMTP_PORT=465  SMTP_USER=  SMTP_PASS=
MAIL_FROM="Mente Ativa <acesso@menteativaa.com.br>"
```
Sem `STRIPE_SECRET_KEY`, as rotas de billing respondem 503 com uma mensagem clara. Sem `SMTP_HOST`, o mailer só registra no log.

## 5. Fases

### Fase 1: base de domínio, modelos e regra de acesso
- **Dependências:** api: `stripe`, `nodemailer` e `@types/nodemailer` (dev). web: `recharts`.
- **`packages/shared/src/billing.ts`**, exportado em `index.ts`:
  - `PLANS = { monthly: { id:'monthly', label:'Mensal', priceCents:4990, interval:'month' }, annual: { id:'annual', label:'Anual', priceCents:53892, interval:'year', monthlyEquivalentCents:4491, discountPercent:10 } }`
  - `TRIAL_DAYS = 7`, `PAST_DUE_GRACE_DAYS = 3`
  - os tipos `PlanId` e `SubscriptionStatus = 'trialing'|'incomplete'|'active'|'past_due'|'canceled'`
  - `formatBRL(cents)`
- **`apps/api/src/modules/shared/infra/models.ts`**:
  - `User`: adicionar `email` (opcional, lowercase, com índice) e `trialEndsAt?: Date`.
  - `Subscription`:
    - campos `username` (unique), `email`, `stripeCustomerId` (unique, sparse), `stripeSubscriptionId` (unique, sparse), `plan`, `status`, `startedAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `canceledAt`;
    - timestamps.
  - `Payment`:
    - campos `username`, `stripeInvoiceId` (unique), `amountCents`, `currency`, `plan`, `status ('paid'|'failed'|'refunded')`, `paidAt`;
    - índice em `paidAt`.
  - `ProcessedStripeEvent`: `eventId` (unique), `type`, `processedAt`.
  - Registrar os `init()` em `modules/shared/infra/database.ts`.
- **`AuthService.trialAccess()`**: gravar `email` e `trialEndsAt = now + TRIAL_DAYS` no `User`. **`signup()`**: passar a pedir e validar o `email`, e acrescentar o campo em `/cadastro` no web.
- **Migração** `apps/api/src/migrate-billing.ts` (script `npm run migrate-billing -w @mente-ativa/api`):
  - usuários `trial` sem `trialEndsAt` recebem `now + 7d` (carência para quem já está testando);
  - usuários com `email` ausente recebem o e-mail do `Lead`, quando existir;
  - o script é idempotente e mostra um resumo no log.
- **`modules/billing/domain/access-policy.ts`**: `hasActiveAccess(user, subscription, now)` e `trialDaysLeft(user, now)`, como funções puras.
- **`errors.ts`**: adicionar `SUBSCRIPTION_REQUIRED` (402) e `BILLING_UNAVAILABLE` (503).
- **`requireAuth`**: depois de carregar o usuário, buscar a `Subscription` e aplicar `hasActiveAccess`. Criar um `requireAuthAllowUnpaid`, usado em `/auth/me` e `/billing/*`. Expor `access: { hasAccess, reason, trialEndsAt, status }` em `/auth/me`.
- **Testes:**
  - unitários de `access-policy` (todos os ramos da RN-PAY-06);
  - integração: trial dentro e fora do prazo (402), seed e admin isentos, signup sem assinatura recebe 402, e `/auth/me` com `access`.

### Fase 2: integração Stripe na API
- **`modules/billing/infra/stripe-gateway.ts`**:
  - interface `BillingGateway { createCustomer, createCheckoutSession, createPortalSession, constructEvent, retrieveSubscription }`;
  - implementação com o SDK `stripe` (fixar a `apiVersion`);
  - `FakeBillingGateway` para testes;
  - injetar no router por uma factory, para que os testes passem o fake.
- **`modules/billing/application/billing-service.ts`**:
  - `getMine(username)`: devolve status, plano, `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialDaysLeft` e os últimos 12 pagamentos.
  - `startCheckout(username, plan)`:
    - cria ou reutiliza o Customer (`email` e `metadata.username`);
    - cria uma Checkout Session com `mode:'subscription'`, o `price` do plano, `customer`, `client_reference_id: username`, `subscription_data.metadata.username`, `locale:'pt-BR'`, `payment_method_types:['card']`, `success_url: APP_URL/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}` e `cancel_url: APP_URL/assinatura/planos`;
    - devolve `{ url }`;
    - responde 409 se já houver uma assinatura `active` (nesse caso, o usuário deve usar o Portal para trocar de plano).
  - `openPortal(username)`: `billingPortal.sessions.create({ customer, return_url: APP_URL/perfil/assinatura })` e devolve `{ url }`.
  - `handleEvent(event)`:
    - primeiro grava o `ProcessedStripeEvent`; se for duplicado (erro 11000), retorna sem processar;
    - `checkout.session.completed`: vincula `stripeSubscriptionId`/`customer` ao `username` (`client_reference_id`), busca a subscription e sincroniza. Se ficar `active` pela primeira vez, envia o **e-mail de acesso liberado**.
    - `invoice.paid`: faz upsert de um `Payment` (`amount_paid`, `status_transitions.paid_at`, plano pelo `price` da linha) e sincroniza o `currentPeriodEnd`.
    - `invoice.payment_failed`: marca `past_due`, registra um `Payment` com status `failed` e envia o e-mail de falha.
    - `customer.subscription.updated`/`deleted`: sincroniza `status`, `plan` (pelo price id), `cancelAtPeriodEnd`, `currentPeriodEnd` (em versões novas da API, ler de `items.data[0].current_period_end`) e `canceledAt`. Ao passar a `cancelAtPeriodEnd=true`, envia o e-mail de cancelamento.
- **`modules/billing/presentation/routes.ts`**:
  - `GET /billing/plans` (público);
  - `GET /billing/me`, `POST /billing/checkout {plan}` e `POST /billing/portal`, todos com auth permitindo usuário sem pagamento;
  - `POST /billing/webhook`, sem auth.
- **`app.ts`**: montar `app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler)` **antes** do `express.json`. Se a assinatura for inválida, responder 400.
- **Testes de integração (gateway fake):**
  - o checkout devolve a url;
  - 409 quando já está ativo;
  - webhook com assinatura inválida devolve 400;
  - `checkout.session.completed` ativa a assinatura e libera o acesso (antes 402, depois 200);
  - evento repetido não duplica o `Payment`;
  - `invoice.paid` cria um `Payment`;
  - `payment_failed` deixa `past_due` e mantém o acesso na carência;
  - o cancelamento no fim do período mantém o acesso até `currentPeriodEnd`.

### Fase 3: e-mail SMTP
- **`modules/shared/infra/mailer.ts`**:
  - `sendMail({ to, subject, html, text })` com nodemailer (`secure` quando a porta for 465);
  - sem `SMTP_HOST`, usa um transporte que só registra no log;
  - erros são logados e **não propagam**, para nunca derrubar o webhook.
- **`modules/billing/application/emails.ts`**: templates em pt-BR (HTML simples, inline, com a marca Mente Ativa e o texto equivalente):
  - `accessReleased(name, plan, nextChargeDate)`, com o botão "Acessar a plataforma" (`APP_URL/login`) e o lembrete do usuário de login;
  - `trialWelcome(name, trialEndsAt)`, enviado no `trialAccess`;
  - `paymentFailed(name)`, com link para `/perfil/assinatura`;
  - `subscriptionCanceled(name, accessUntil)`.
- **Testes:** o mailer é fake. Verificar que a ativação envia exatamente 1 e-mail e que um evento duplicado não reenvia.

### Fase 4: telas do usuário (web)
Criar em `apps/web/src/pages/billing/`, sem aumentar o `App.tsx` além das rotas e do menu.
- **`PlansPage`** em `/assinatura/planos`: cards no **estilo Wellhub**, seguindo a referência enviada:
  - grid de cards brancos com borda `--line`, cantos arredondados e uma **faixa colorida no topo**, com `--accent` no plano em destaque;
  - topo: um badge pequeno ("Ativo" em lilás no plano atual, "Economize 10%" no anual), o **nome do plano** em negrito e o subtítulo ("Assinatura mensal" / "Assinatura anual");
  - **preço grande** "R$ 49,90**/mês**". No anual: "R$ 44,91/mês" e a linha "R$ 538,92 cobrados anualmente";
  - um divisor e depois a lista de benefícios com ícones SVG inline (acesso completo à plataforma, pacientes ilimitados, fichas e evoluções, rotinas, suporte por e-mail; os textos ficam em `PLANS` no shared);
  - **botão em pílula** cheio "Escolher plano". No plano atual, um pílula cinza desabilitado "Renova em dd/mm/aaaa";
  - no celular, a lista de cards ganha rolagem horizontal com *scroll-snap*;
  - clicar em "Escolher plano" chama `POST /billing/checkout` e faz `window.location.href = url`.
- **`CheckoutSuccessPage`** em `/assinatura/sucesso`: mostra "Confirmando pagamento…" e faz polling de `/billing/me` a cada 2s, por até 30s. Quando o status vira `active`, mostra "Acesso liberado!" e redireciona para `/`. Se o tempo esgotar, diz que a confirmação chega por e-mail.
- **`SubscriptionSettingsPage`** em `/perfil/assinatura`:
  - mostra status (com selo), plano, valor, próxima cobrança ou data de fim do acesso, e o aviso "Cancelada: acesso até dd/mm" quando houver;
  - histórico de pagamentos com data, valor e status;
  - botões **"Atualizar forma de pagamento"** e **"Cancelar assinatura"**, que abrem o Portal via `POST /billing/portal`;
  - durante o trial, mostra os dias restantes e o botão "Ver planos".
- **`AppShell`**:
  - item **"Assinatura"** no menu para profissionais (`/perfil/assinatura`); para o admin, o item **"Assinaturas"** (`/admin/assinaturas`);
  - **banner** no topo durante o trial: "Seu teste grátis termina em X dias · Assinar agora".
- **Tratamento do 402** em `client()`/`api.ts`: ao receber `SUBSCRIPTION_REQUIRED`, navegar para `/assinatura/planos`. A tela de planos mostra "Seu período de teste terminou" quando for o caso.
- **CSS** em `styles/prototype.css` (classes `.plan-card`, `.plan-band`, `.plan-price`, `.plan-cta`…), usando só os tokens existentes e funcionando no modo escuro.
- **Testes** (`App.test.tsx`, com fetch mockado): os cards mostram os preços certos; o 402 redireciona para os planos; a tela de assinatura mostra o status e o histórico.

### Fase 5: painel do administrador
- **`modules/billing/application/billing-metrics-service.ts`**, exposto em `GET /admin/billing/summary` com `requireAuth, requireAdmin`:
  - **KPIs:** assinaturas ativas (mensal e anual), em trial, inadimplentes, canceladas no mês, **MRR** (mensais × 49,90 + anuais × 538,92 ÷ 12), **ARR**, receita do mês, receita total, **ticket médio**, **conversão trial → pago** (trials que viraram assinaturas, nos últimos 30 dias), **churn** do mês;
  - **séries de 12 meses:** receita por mês (soma de `Payment` pago), novas assinaturas por mês e cancelamentos por mês;
  - **próximos 30 dias:** renovações previstas e receita prevista.
- **`GET /admin/billing/subscriptions?status=&plan=`**: lista com usuário, nome, e-mail, plano, status, **data de aquisição** (`startedAt`), **vencimento / próxima cobrança** (`currentPeriodEnd`), **quantidade de pagamentos**, **total pago** e o último pagamento. Inclui também os usuários em trial, com a data de fim do trial.
- **Web, `AdminBillingPage`** em `/admin/assinaturas` (dentro de `AdminOnly`):
  - linha de KPIs (cartões numéricos);
  - **gráfico de barras** da receita mensal e **gráfico de linhas** de novas assinaturas × cancelamentos (`recharts`, com as cores dos tokens do CSS);
  - **gráfico de rosca** mensal × anual;
  - tabela com filtros por status e plano, e um link para o cliente no painel do Stripe (`https://dashboard.stripe.com/customers/<id>`).
- **Testes:** a integração confere os cálculos de MRR, receita mensal e contagens com dados conhecidos; 403 para quem não é admin.

### Fase 6: documentação, homologação e produção
1. Atualizar `docs/business-rules.md` com as RN-PAY-01..10, apontando para o código e os testes.
2. Homologação local:
   - `npm run dev` + `stripe listen`;
   - fluxo completo: "Quero testar" → banner do trial → ajustar `trialEndsAt` no banco para forçar a expiração → 402 → planos → checkout com o cartão `4242 4242 4242 4242` → página de sucesso → e-mail → acesso liberado;
   - Portal: trocar o cartão (usar `4000 0000 0000 0341` para simular uma falha), trocar de plano e cancelar;
   - conferir o painel do admin.
3. Produção:
   - preencher as variáveis no Render;
   - rodar `npm run migrate-billing` apontando para o Atlas;
   - criar o webhook live e trocar para as chaves **live** depois da validação em modo de teste;
   - fazer **uma compra real de R$ 49,90 e reembolsar** pelo painel do Stripe.
4. Antes de vender: publicar Termos de Uso e Política de Cancelamento/Reembolso (direito de arrependimento de 7 dias do CDC; o reembolso é feito pelo painel do Stripe) e colocar os links nos cards de planos e no Portal.

## 6. Fora do escopo desta entrega
- Pix ou boleto no plano anual.
- Cupons de desconto.
- Nota fiscal (NFS-e).
- Lembrete por e-mail 2 dias antes do fim do trial (precisa de um job agendado; próxima iteração).
- Reembolso dentro da plataforma.
