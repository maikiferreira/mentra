# Mente Ativa: troca do Stripe pela Eduzz nas assinaturas

> Roteiro para o Claude Code. Execute **uma fase por vez**. Ao fim de cada fase, rode `npm run test`, `npm run typecheck` e `npm run lint` e faça um commit. Não faça push nem deploy sem confirmação.
> Este documento substitui `docs/specs/pagamentos-stripe.md`. As regras de negócio (RN-PAY-01..10) continuam valendo, com as mudanças de provedor descritas aqui.

## 1. Contexto
- O módulo de assinaturas já está em produção, no `main` (PR #1), integrado ao **Stripe**:
  - `apps/api/src/modules/billing/**` (`stripe-gateway.ts`, `billing-service.ts`, `routes.ts`, `emails.ts`, `access-policy.ts`, `billing-metrics-service.ts`) e `migrate-billing.ts`;
  - web em `apps/web/src/pages/billing/**`;
  - shared em `packages/shared/src/billing.ts`.
- **A decisão agora é usar a Eduzz.** A página de pagamento passa a ser a da Eduzz (`https://chk.eduzz.com/...`). A Eduzz avisa a nossa API por webhook, e o acesso é liberado a partir desses avisos.
- **O que continua igual:**
  - o trial de 7 dias (`User.trialEndsAt`);
  - a regra `hasActiveAccess` e o 402 `SUBSCRIPTION_REQUIRED`;
  - os cards estilo Wellhub, o banner de trial e o painel do admin;
  - o mailer SMTP e os templates;
  - a idempotência dos eventos.
- **O que muda:** só a camada do provedor (gateway, webhook e campos dos modelos), a forma de abrir o checkout e a tela de gerenciar assinatura.

## 2. Fatos da Eduzz (conferidos em developers.eduzz.com)
- **Formato do webhook:** `{ id, event, data, sentDate }`.
- **Segurança:** cabeçalho **`x-signature`** = **HMAC-SHA256(chave_secreta, corpo bruto)**. A chave é gerada no Console Eduzz, em Webhook → Segurança. A codificação (hex ou base64) **não está documentada**: confirmar com o evento de **ping** e aceitar as duas.
- **Eventos usados:**
  - `myeduzz.invoice_paid`: fatura paga. Campos usados:
    - `data.id`, `status`, `paidAt`, `price`, `paid`, `installments`, `paymentMethod`;
    - `buyer.email` e `buyer.name`;
    - `items[].productId` e `items[].price`;
    - `contract.id`;
    - `tracker.code1..3` e `utm.*`.
  - `myeduzz.contract_created` e `myeduzz.contract_updated`: assinatura criada ou atualizada. O contrato tem `status ∈ {upToDate, awaitingPayment, late, canceled, defaulter, suspended, trial, finished, free}`, a próxima data de cobrança, o comprador, o produto e o `id`.
  - `myeduzz.invoice_refunded` e `myeduzz.invoice_chargeback`: reembolso e estorno.
  - Ignorar com 200: `invoice_opened`, `invoice_waiting_payment`, `invoice_expired`, `invoice_canceled`, `invoice_recovering` e o ping.
- **Meios de pagamento:** a Eduzz cobra assinaturas por **cartão (crédito ou débito), Pix, boleto e saldo Eduzz** (eventos `contract_*_attempted`). Isso atende a regra 1 original (crédito ou débito), e com mais opções.

## 3. Pré-requisitos manuais (você)
1. **O produto atual precisa ser do tipo assinatura.**
   - O link `https://chk.eduzz.com/7WXG88YO0A` hoje mostra "12x de R$ 5,16 ou R$ 49,90 à vista". Isso é **venda única parcelada**, não cobrança mensal recorrente.
   - Na Eduzz, o produto (ou a oferta) precisa estar como **Assinatura / Recorrência mensal, R$ 49,90**.
2. **Plano anual:** criar uma segunda oferta, com recorrência **anual de R$ 538,92**, e anotar o link de checkout dela.
3. Anotar o **ID do produto** (`productId`) de cada plano. É ele que diz ao webhook se a compra é mensal ou anual.
4. **Webhook** no **console.eduzz.com → Webhook**:
   - Criar uma URL `https://mente-ativa-api.onrender.com/api/v1/billing/eduzz/webhook` (depois, `https://api.menteativaa.com.br/...`).
   - Assinar os eventos de **MyEduzz: Fatura** (`paid`, `refunded`, `chargeback`) e **MyEduzz: Assinaturas** (`contract_created`, `contract_updated`).
   - Fazer a **Ativação da URL**: a Eduzz envia um ping, e a API precisa estar publicada com a Fase 2.
   - Em **Segurança**, gerar a **chave secreta**.
5. **Teste:** fazer uma compra real de R$ 49,90 com o próprio cartão e reembolsar pela Eduzz. A Eduzz não tem modo sandbox para checkout. O console permite **reenviar eventos** pelo Histórico de Envios.

## 4. Variáveis de ambiente
Documentar no `.env.example` e no `render.yaml` com `sync:false`, e **remover** as `STRIPE_*`.
```
APP_URL=https://mente-ativa-web.onrender.com
EDUZZ_CHECKOUT_MONTHLY=https://chk.eduzz.com/<link-mensal>
EDUZZ_CHECKOUT_ANNUAL=https://chk.eduzz.com/<link-anual>
EDUZZ_PRODUCT_MONTHLY=<productId>
EDUZZ_PRODUCT_ANNUAL=<productId>
EDUZZ_WEBHOOK_SECRET=<chave da tela Segurança>
EDUZZ_CUSTOMER_AREA_URL=https://orbita.eduzz.com      # área do comprador (confirmar na Fase 0)
```

## 5. Fases

### Fase 0: verificações rápidas (antes de codar, ~15 min)
- [ ] Descobrir qual parâmetro de URL do checkout Eduzz preenche o **`tracker.code1`** (em geral `?trk=`) e qual **pré-preenche o e-mail** (`?email=`):
  - fazer uma compra de teste com `?trk=teste123&email=...`;
  - ver no Histórico de Envios do webhook se `tracker.code1 = teste123`.
- [ ] Confirmar a **URL da área do comprador** onde o cliente troca o cartão e cancela (Órbita / MyEduzz).
- [ ] Confirmar a **codificação** do `x-signature` (hex ou base64) pelo ping.
- Registrar os resultados no topo deste documento.

### Fase 1: modelos e remoção do Stripe
- **`packages/shared/src/billing.ts`**: manter `PLANS` e `formatBRL`. Atualizar os textos de "meios de pagamento" para cartão de crédito ou débito, Pix e boleto.
- **`modules/shared/infra/models.ts`**:
  - `Subscription`:
    - trocar `stripeCustomerId`/`stripeSubscriptionId` por `provider: 'eduzz'`, `eduzzContractId` (unique, sparse) e `buyerEmail`;
    - manter `plan`, `status`, `startedAt`, `currentPeriodEnd`, `cancelAtPeriodEnd` e `canceledAt`.
  - `Payment`: trocar `stripeInvoiceId` por `providerInvoiceId` (unique) e adicionar `paymentMethod` e `installments`.
  - Renomear `ProcessedStripeEvent` para **`ProcessedWebhookEvent`** (`eventId` unique, `provider`, `type`).
- **Migração** `migrate-billing.ts` (idempotente):
  - apagar as `Subscription`/`Payment`/`ProcessedStripeEvent` criadas no teste com o Stripe (não há clientes reais);
  - manter o `trialEndsAt` dos usuários.
- **Remover o Stripe:**
  - a dependência `stripe`;
  - `stripe-gateway.ts` e `stripe-gateway.test.ts`;
  - a rota `/billing/portal`, as variáveis `STRIPE_*` e as menções no `render.yaml`;
  - `pagamentos-stripe.md`, que vai para `docs/specs/arquivados/`.

### Fase 2: gateway Eduzz e webhook (API)
- **`modules/billing/infra/eduzz-gateway.ts`**:
  - `checkoutUrl(plan, { username, email })`: monta `EDUZZ_CHECKOUT_<PLAN>` com os parâmetros confirmados na Fase 0, `trk=<username>` e `email=<email>`;
  - `verifySignature(rawBody, header)`: HMAC-SHA256 com `crypto.timingSafeEqual`, aceitando hex ou base64;
  - `parseEvent(json) → BillingEvent`, convertendo os eventos da Eduzz para o tipo interno já usado pelo `billing-service` (`invoice_paid`, `subscription_updated`, `invoice_refunded`, `ignored`).
- **Mapa de status do contrato → `SubscriptionStatus`:**
  - `upToDate` → `active`;
  - `trial` → `trialing`;
  - `awaitingPayment` e `late` → `past_due`;
  - `defaulter` e `suspended` → `past_due` (o acesso cai depois da carência de 3 dias);
  - `canceled` → `canceled`, com `cancelAtPeriodEnd=true`;
  - `finished` → `canceled`;
  - `free` → `active`.
- **Identificar o usuário no evento:**
  1. `tracker.code1` = `username`;
  2. senão, a `Subscription` com o mesmo `eduzzContractId`;
  3. senão, o `User` com `email` = `buyer.email`;
  4. se nada bater, registrar como **órfão** (log de aviso, coleção `UnmatchedBillingEvent`, mostrada no admin para vincular manualmente) e responder 200.
- **Plano:** `items[].productId` comparado com `EDUZZ_PRODUCT_MONTHLY`/`ANNUAL`.
- **`billing-service.handleEvent`**:
  - `invoice_paid`:
    - upsert de um `Payment` (`providerInvoiceId = data.id`, `amountCents = round(paid*100)`, `paidAt`, `paymentMethod`, `installments`, `plan`);
    - assinatura em `active`, com `currentPeriodEnd = paidAt + 1 mês ou 1 ano`, ou a próxima data de cobrança do contrato, quando vier;
    - **e-mail de acesso liberado** na primeira ativação.
  - `contract_created` e `contract_updated`: sincronizar status, `currentPeriodEnd` (próxima cobrança) e `canceledAt`. Ao virar `canceled`, enviar o e-mail de cancelamento. Ao virar `late`, o e-mail de falha.
  - `invoice_refunded` e `invoice_chargeback`: `Payment.status='refunded'`, assinatura `canceled` e `currentPeriodEnd = agora` (o acesso cai).
- **Rotas:**
  - `GET /billing/checkout-url?plan=` (auth sem exigir pagamento) devolve `{ url }`. Responde 409 se a assinatura já está `active`.
  - `POST /billing/eduzz/webhook`: `express.raw`, **antes do `express.json`** em `app.ts`. Assinatura inválida → 401. Eventos duplicados (`ProcessedWebhookEvent`) → 200 sem reprocessar. Erro interno → 500, para a Eduzz reenviar.
- **Testes** (`billing.integration.test.ts`, com o `FakeBillingGateway` adaptado e fixtures JSON dos eventos Eduzz em `src/modules/billing/infra/__fixtures__/`):
  - assinatura válida e inválida;
  - `invoice_paid` com tracker ativa o usuário certo e envia 1 e-mail;
  - casamento por e-mail sem tracker;
  - evento órfão;
  - duplicado ignorado;
  - `contract_updated` `late` → `past_due` com carência;
  - `canceled` mantém o acesso até `currentPeriodEnd`;
  - `refunded` corta o acesso;
  - mapeamento de plano por `productId`.

### Fase 3: web
- **`PlansPage`**: o botão "Escolher plano" chama `GET /billing/checkout-url?plan=` e faz `window.location.href = url`. Os cards Wellhub continuam iguais. Abaixo do preço, mostrar "Cartão de crédito ou débito, Pix ou boleto".
- **`CheckoutSuccessPage`**:
  - configurar na Eduzz a **página de obrigado** apontando para `APP_URL/assinatura/sucesso`;
  - manter o polling de `/billing/me` por até 60s;
  - se esgotar o tempo, mostrar: "Pix e boleto podem levar alguns minutos; avisaremos por e-mail".
- **`SubscriptionSettingsPage`**:
  - trocar "Atualizar forma de pagamento" e "Cancelar assinatura" por um botão **"Gerenciar na Eduzz"**, que abre `EDUZZ_CUSTOMER_AREA_URL` (vindo de `/billing/me`) em nova aba;
  - texto de ajuda: "Entre com o e-mail usado na compra";
  - manter o histórico de pagamentos e o status.
- **`AdminBillingPage`**:
  - trocar o link "ver no Stripe" pelo link do console Eduzz;
  - adicionar a seção **"Pagamentos não vinculados"** (eventos órfãos), com uma ação de vincular a um usuário (`POST /admin/billing/unmatched/:id/link {username}`);
  - incluir a quebra por **meio de pagamento** (cartão, Pix ou boleto) num gráfico de rosca.
- **Testes:** atualizar `App.test.tsx` e os testes de billing para o novo botão e o novo endpoint.

### Fase 4: deploy e homologação
1. No Render, remover as variáveis `STRIPE_*`, adicionar as `EDUZZ_*` e fazer o deploy. Rodar `npm run migrate-billing -w @mente-ativa/api` no Shell do Render.
2. Fazer a **Ativação da URL** no console Eduzz: o ping precisa receber 200.
3. **Compra real de R$ 49,90** com um usuário de teste vindo do "Quero testar". Conferir:
   - o webhook com 200 no Histórico de Envios;
   - a assinatura `active`;
   - o e-mail de liberação;
   - o painel do admin.
4. Reembolsar pela Eduzz e conferir que `invoice_refunded` corta o acesso.
5. Atualizar `docs/business-rules.md`:
   - RN-PAY-02 passa a incluir débito, Pix e boleto;
   - RN-PAY-07 passa a ser a gestão pela área do comprador Eduzz;
   - nova regra RN-PAY-11 para eventos órfãos.

## 6. Fora do escopo
- Cancelar ou trocar de plano **dentro** da plataforma via API Eduzz (dá para fazer depois, se a API de contratos permitir).
- Nota fiscal (a Eduzz pode emitir).
- Cupons.
- Lembrete de fim do trial.
