# Mente Ativa — Migração do protótipo para React + Node.js + MongoDB

> Documento de entrada para o Claude Code (VS Code).
> O protótipo atual é **um único arquivo HTML** (`mente-ativa-prototipo.html`) com dados mocados em memória.
> Objetivo: transformar em uma aplicação real (React + API Node/DDD/SOLID + MongoDB) **sem mudar nada do que o cliente vê e faz**.

---

## 0. Como usar este documento (leia primeiro)

**Prompt inicial sugerido para o Claude Code:**

```
Leia MENTE_ATIVA_MIGRACAO_REACT_NODE_MONGO.md inteiro e o arquivo de referência
docs/prototipo/mente-ativa-prototipo.html (é a fonte da verdade do comportamento e do visual).
Trabalhe em fases (seção 12). Em cada fase: implemente, escreva testes, rode-os e só então avance.
Mantenha docs/business-rules.md atualizado conforme implementa (seção 11).
Regra de ouro: o cliente NÃO pode perceber diferença de comportamento nem de visual em relação ao protótipo.
```

**Arquivos a colocar no repositório antes de começar:**

| Arquivo | Destino | Função |
|---|---|---|
| `mente-ativa-prototipo.html` | `docs/prototipo/mente-ativa-prototipo.html` | Referência executável. Abra no navegador para comparar lado a lado. Contém **todo o CSS** (copiar para o React), textos exatos e a lógica original. |
| `logo.jpg` (160×160) | `apps/web/src/assets/logo.jpg` | Logo exibida no menu lateral e no login (no HTML está embutida em base64). |
| este `.md` | raiz | Especificação. |

**Princípio de paridade (IMPORTANTE):**
1. O **layout, cores, fontes, textos, mensagens de erro, ordem dos elementos, animações e temporizações** do protótipo são requisito. Copie o CSS do protótipo para o React (CSS global ou CSS Modules com as mesmas regras). Não "melhore" o visual.
2. Os **textos em pt-BR** citados neste documento estão exatos; reutilize literalmente.
3. Os únicos **desvios permitidos** (invisíveis ou benéficos para o cliente) estão na seção 13.
4. Em caso de dúvida entre "como o protótipo faz" e "como seria o ideal", **vale o protótipo**.

---

## 1. Visão do produto

**Mente Ativa**: plataforma para profissionais que estimulam a mente de idosos acompanharem a evolução cognitiva de cada paciente (a partir das fichas de avaliação) e planejarem a rotina de atividades, com sugestões de IA. Princípio exibido no rodapé de todas as telas:

> **A tecnologia sugere. O profissional decide.** As sugestões não são diagnóstico nem prescrição.

Restrições de conformidade (refletidas nos textos): LGPD (pacientes identificados só por código + iniciais), nada de linguagem de "laudo"/diagnóstico (Anvisa SaMD).

**"Mágico de Oz":** a extração de dados da ficha **é simulada** (o protótipo gera uma ficha fictícia por regras). Isso deve continuar assim, **atrás de uma interface (porta)** para trocar por IA/OCR real no futuro sem mexer no resto (seção 6.3).

---

## 2. Stack e arquitetura

- **Front:** React 18 + TypeScript + Vite, React Router, TanStack Query (dados do servidor), Zustand (estado só de UI), CSS do protótipo.
- **API:** Node.js 20 + TypeScript + Express (ou Fastify), validação com Zod, JWT, bcrypt, Vitest/Jest + Supertest.
- **Banco:** MongoDB (driver oficial ou Mongoose), índices únicos, transações onde indicado.
- **Monorepo** (npm workspaces/pnpm):

```
mente-ativa/
├─ apps/
│  ├─ web/                      # React
│  └─ api/                      # Node (DDD)
├─ packages/
│  └─ shared/                   # tipos/DTOs/constantes compartilhados (domínios MEEM, enums, textos)
├─ docs/
│  ├─ prototipo/mente-ativa-prototipo.html
│  └─ business-rules.md         # mantido durante o desenvolvimento (seção 11)
└─ docker-compose.yml           # mongo + api + web
```

### 2.1 API — DDD em camadas

Bounded contexts (módulos) e responsabilidades:

| Módulo | Agregados / serviços | Observação |
|---|---|---|
| `identity` | `User`, `TrialLead`; serviços: `AuthService`, `TrialAccessService` | login, cadastro, "Quero testar", usuários |
| `patients` | `Patient` (raiz; embute `Evaluation[]`, `PendingFicha`, `SuggestionState[]`, contador `generationCursor`) | CRUD, visibilidade por responsável |
| `evaluations` | casos de uso de ficha; porta `FichaExtractor` + `MagicOzFichaExtractor` | upload simulado, conferência, confirmação |
| `care-planning` | domínio puro: `SuggestionEngine`, `ActivityLibrary`, `TrendCalculator` | regras de sugestão e rotina |
| `dashboard` | *read models*: `HomeSummaryQuery`, `RoutinesQuery` | KPIs e "Para fazer hoje" |

Estrutura por módulo:

```
modules/<contexto>/
  domain/          # entidades, value objects, agregados, serviços de domínio, eventos, interfaces de repositório (PORTAS)
  application/     # casos de uso (1 classe = 1 caso de uso), DTOs, mapeadores
  infrastructure/  # MongoPatientRepository, BcryptHasher, SystemClock, MagicOzFichaExtractor...
  presentation/    # rotas Express, controllers finos, schemas Zod, middlewares
shared/kernel/     # Result/Either, DomainError, ValueObject base, tipos
shared/infra/      # conexão Mongo, logger, config, error-handler
```

### 2.2 SOLID (como aplicar aqui)

- **S** — um caso de uso por classe (`CreatePatient`, `ConfirmPendingFicha`, `AcceptSuggestion`...). Controllers só traduzem HTTP ⇄ caso de uso.
- **O** — novas regras de sugestão = novas estratégias; extrator de ficha novo = nova implementação da porta, sem editar os casos de uso.
- **L** — qualquer `FichaExtractor` (mágico de Oz ou IA real) devolve o mesmo contrato.
- **I** — interfaces pequenas: `PatientRepository`, `UserRepository`, `LeadRepository`, `PasswordHasher`, `Clock`, `FichaExtractor`, `TokenService`.
- **D** — casos de uso dependem de interfaces (domínio/aplicação); implementações Mongo/bcrypt/JWT ficam na infraestrutura e são injetadas (composition root manual ou `tsyringe`).

Portas obrigatórias:

```ts
interface Clock { now(): Date; todayBR(): string /* 'dd/mm/yyyy' em America/Sao_Paulo */ }
interface PasswordHasher { hash(p: string): Promise<string>; compare(p: string, h: string): Promise<boolean> }
interface FichaExtractor {            // Mágico de Oz hoje; IA/OCR amanhã
  generate(input: { patient: Patient; date: string }): Promise<PendingFicha>
}
```

---

## 3. Mapa de telas e rotas do front (React Router)

O protótipo não tem URLs (tudo é estado). Mapeamento para rotas reais, **mantendo exatamente a mesma navegação**:

| Estado no protótipo | Rota React | Acesso | Tela |
|---|---|---|---|
| `!S.user` (modo login) | `/login` | público | Entrar |
| `!S.user` (modo signup) | `/cadastro` | público | Criar conta |
| `!S.user` (modo lead) | `/quero-testar` | público | Quero testar o Mente Ativa |
| `view='home'` | `/` | autenticado | Início |
| `view='list'` | `/pacientes` | autenticado | Pacientes |
| `view='form'` (novo) | `/pacientes/novo` | autenticado | Novo paciente |
| `view='patient'` + aba `fichas` | `/pacientes/:id` (ou `/pacientes/:id/fichas`) | dono do paciente ou admin | Paciente → Fichas |
| aba `evol` | `/pacientes/:id/evolucao` | idem | Evolução e sugestões |
| aba `dados` | `/pacientes/:id/dados` | idem | Dados do paciente |
| `view='form'` (editar) | `/pacientes/:id/editar` | idem | Editar dados do paciente |
| `view='routine'` | `/rotinas` | autenticado | Rotinas |
| `view='users'` | `/usuarios` | **somente admin** | Usuários (+ pedidos de teste) |

Regras de navegação equivalentes ao protótipo:
- Não autenticado → qualquer rota privada redireciona para `/login`. Autenticado em `/login` → `/`.
- Ao autenticar (login, cadastro, "Quero testar") → `/` (Início).
- Rota de paciente de outro responsável (não admin) → 404 (a API responde 404, não 403, para não revelar existência).
- `/usuarios` por não-admin → redireciona para `/`.
- Ao trocar de item do menu lateral: zera estado de UI transitório (confirmação de exclusão aberta, erros de formulário). Rolar a página para o topo em toda navegação.
- Menu lateral "ativo": `Pacientes` fica ativo em `/pacientes*`; `Início` em `/`; `Rotinas` em `/rotinas`; `Usuários` em `/usuarios`.

---

## 4. Layout global (idêntico ao protótipo)

- **Sidebar esquerda (≥ 821px)**, 240px, sticky, altura 100vh, borda direita: logo (40×40, raio 10) + "Mente Ativa", `nav` (Início, Pacientes, Rotinas, [Usuários só admin]), e no rodapé: bloco do usuário (nome em negrito; "Administrador" ou "Profissional" + " · " + usuário) e botão **Sair**; acima do rodapé, selo "Protótipo · dados fictícios" (controlar por `VITE_SHOW_DEMO_FLAG=true`, ligado por padrão).
- **Mobile (≤ 820px):** sidebar vira cabeçalho no topo; o `nav` fica horizontal com rolagem; bloco do usuário em linha; selo oculto.
- Item **Pacientes** mostra um contador (chip `warn`) = nº de pacientes visíveis com ficha pendente (só se > 0).
- Conteúdo: `main` + rodapé com o princípio (seção 1).
- Sem sessão: sidebar oculta; tela de auth centralizada (max 420px, margem-topo `6vh`).
- Tema claro/escuro via tokens CSS do protótipo (`prefers-color-scheme` + `[data-theme]`). Fontes: Bricolage Grotesque (títulos), Public Sans (corpo), Caveat (ficha manuscrita).
- Acessibilidade mantida: `role="tablist"/"tab"`, `aria-selected`, `aria-current="page"`, `role="alert"` em erros, `role="dialog" aria-modal` no pop-up.

---

## 5. Domínio e regras de negócio (catálogo)

Cada regra tem um ID (`RN-…`). **Cada caso de uso e cada teste deve citar os IDs** que cobre (seção 11).

### 5.1 Instrumento (MEEM — exemplo ilustrativo)

Pontuação 0–30. Domínios (ordem fixa):

| `key` | Nome exibido | Máx |
|---|---|---|
| `ori` | Orientação | 10 |
| `reg` | Memória imediata | 3 |
| `ate` | Atenção e cálculo | 5 |
| `evo` | Evocação | 3 |
| `lin` | Linguagem | 9 |

`total(avaliação) = soma dos 5 domínios`. Texto fixo na UI: "Instrumento de exemplo: MEEM (0 a 30)". (O instrumento real será definido com a Etiene; tratar `Instrument` como configurável no futuro, mas hoje é constante.)

### 5.2 Autenticação e usuários

- **RN-AUTH-01** Usuários semente: `admin/admin` (Administrador, admin), `prof1/prof1` ("Profissional 1"), `prof2/prof2` ("Profissional 2").
- **RN-AUTH-02** Login: `usuário` é comparado em minúsculas e sem espaços nas pontas; senha exata. Falha → "Usuário ou senha incorretos."
- **RN-AUTH-03** Cadastro (`signup`), nesta ordem de validação:
  1. nome obrigatório → "Informe seu nome."
  2. usuário (minúsculo/trim) deve casar `^[a-z0-9._-]{3,}$` → "O usuário deve ter ao menos 3 caracteres, só letras, números, ponto, hífen ou sublinhado."
  3. usuário único → "Este usuário já existe. Escolha outro."
  4. senha ≥ 4 caracteres → "A senha deve ter ao menos 4 caracteres."
  5. confirmação igual → "As senhas não conferem."
  Sucesso: cria usuário **profissional (não admin)** e **entra automaticamente** (vai para Início).
- **RN-AUTH-04** Perfil `admin` vê tudo; `professional` vê só os próprios pacientes (ver RN-PAT-01).
- **RN-AUTH-05** Senhas **sempre com hash** (bcrypt) no banco. (No protótipo eram texto puro — desvio permitido.)
- **RN-AUTH-06** Logout limpa sessão e todo estado de UI; volta ao `/login` em modo "login".

### 5.3 "Quero testar" (acesso de teste automático)

- **RN-LEAD-01** Campos: nome (obrig.), telefone/WhatsApp (obrig.), e-mail (obrig.), "Como você atua?" (lista), local de atuação (opcional), autorização de contato (checkbox obrig.).
  Lista `perfil`: `Gerontólogo(a)`, `Educador(a) físico(a)`, `Fisioterapeuta`, `Terapeuta ocupacional`, `Psicólogo(a)`, `Cuidador(a) ou familiar`, `Outro` (padrão: o primeiro).
- **RN-LEAD-02** Validação, nesta ordem: nome → "Informe seu nome."; telefone com **≥ 8 dígitos** (só dígitos contam) → "Informe um telefone com DDD."; e-mail `^[^\s@]+@[^\s@]+\.[^\s@]+$` → "Informe um e-mail válido."; autorização → "Marque a autorização para receber o contato."
- **RN-LEAD-03** Ao enviar com sucesso, **cria a conta e entra direto**, sem pacientes:
  - `usuário` = **primeiro nome** em minúsculas, sem acentos (`normalize('NFD')` removendo `̀–ͯ`), mantendo só `[a-z0-9._-]`; se ficar vazio → `usuario`;
  - se já existir, sufixo numérico crescente: `agata`, `agata2`, `agata3`…;
  - `senha` = **4 últimos dígitos do telefone**;
  - perfil `professional`; nome = nome informado.
- **RN-LEAD-04** Registra o pedido (lead) com: nome, telefone (como digitado), e-mail, perfil, local, usuário gerado, data/hora ISO. **Nunca grava a senha em texto** no lead.
- **RN-LEAD-05** Pop-up de boas-vindas **imediatamente após o acesso** (ver 8.1). A senha em texto só existe na resposta dessa requisição (para o pop-up) e na cabeça do usuário.
- **RN-LEAD-06** O admin vê os pedidos na tela **Usuários** (tabela "Pedidos de teste", mais recentes primeiro). Exemplo: "Ágata Souza", `(32) 9 1234-5678` → usuário `agata`, senha `5678`.

### 5.4 Pacientes

- **RN-PAT-01** Visibilidade: admin lista/abre **todos**; profissional só os com `responsibleUsername == seu usuário`. Vale para lista, Início (KPIs e "Para fazer hoje"), Rotinas, e acesso direto por id.
- **RN-PAT-02** Responsável = **usuário logado que cadastrou**; não editável (no formulário aparece só leitura, com o nome do usuário; ao editar mostra o responsável atual). Texto de ajuda: "Definido pelo usuário que cadastra o paciente."
- **RN-PAT-03** Código (`id`) sequencial de 3 dígitos com zero à esquerda = `(maior código numérico existente) + 1` → `022`, `023`… Índice único; em caso de colisão por concorrência, tentar de novo.
- **RN-PAT-04** Campos e validações (ordem de checagem e mensagens exatas):
  1. `initials` obrigatório (trim, máx. 10) → "Informe as iniciais do paciente."
  2. `age` inteiro entre 40 e 110 → "Informe a idade, entre 40 e 110 anos."
  3. `educationYears` opcional (vazio permitido); se informado, inteiro 0–30 → "A escolaridade deve ficar entre 0 e 30 anos de estudo."
  4. `emergencyContact.name` obrigatório → "Informe o nome do contato de emergência."
  5. `emergencyContact.phone` com ≥ 8 dígitos → "Informe o telefone do contato de emergência, com DDD."
  6. `phone` (do paciente) opcional; se informado, ≥ 8 dígitos → "O telefone do paciente parece incompleto."
- **RN-PAT-05** Enums:
  - `group` (Modalidade): `Individual`, `Grupo da manhã`, `Grupo da tarde` (padrão `Individual`)
  - `vision`/`hearing`/`mobility`: `Sem limitação`, `Leve`, `Importante` (padrão `Sem limitação`)
  - `emergencyContact.relationship`: `Filho(a)`, `Cônjuge`, `Irmão(ã)`, `Neto(a)`, `Sobrinho(a)`, `Cuidador(a)`, `Outro` (padrão `Filho(a)`)
- **RN-PAT-06** Texto de privacidade exibido no formulário: "Identifique o paciente só por iniciais. No protótipo, use dados fictícios. No produto, endereço e telefone exigem o consentimento do paciente (LGPD)." (Manter literal.) Sem nome completo/CPF.
- **RN-PAT-07** Editar mantém código, responsável, avaliações, ficha pendente e estados de sugestão. Excluir **remove em cascata** avaliações, ficha pendente e estados de sugestão (confirmação em 2 passos na UI, ver 7.5).
- **RN-PAT-08** Paciente novo nasce **sem avaliações**; Evolução mostra estado vazio e a Home mostra "Sem avaliações".

### 5.5 Fichas e avaliações

- **RN-FIC-01** Cada avaliação: `date` (string de exibição), `scores{ori,reg,ate,evo,lin}`, `total` derivado. Datas de avaliações novas = **hoje em `dd/mm/yyyy` no fuso `America/Sao_Paulo`** (servidor, via `Clock`). Se já existir avaliação do paciente com a **mesma data**, a nova recebe sufixo ` #2`, ` #3`… (`uniqDate`). Na UI, o sufixo é **ocultado** (`fullDate`: texto antes do espaço) em fichas, banners e tabelas de ficha; nas tabelas/gráfico de evolução e nos "chips de fonte" aparece a `date` completa.
- **RN-FIC-02** Só pode haver **uma ficha pendente por paciente**. Enviar nova ficha com pendente existente → ignorado no protótipo; na API: `409 Conflict`.
- **RN-FIC-03** O envio ("Enviar nova ficha") **gera a ficha pendente** pelo extrator (seção 6.3). UI: 1,1 s de "Recebendo a ficha…" antes de mostrar a ficha.
- **RN-FIC-04** Extração (passo visual): ao clicar "Extrair dados com IA", 3 etapas de 650 ms ("Lendo a ficha", "Identificando os campos", "Conferindo a soma do total") e então a tela de revisão. **Somente animação no front**; a API já devolveu os valores.
- **RN-FIC-05** Revisão: campos numéricos editáveis (min 0, máx do domínio), data somente leitura, observações editáveis. **Um** domínio vem sinalizado ("baixa confiança, escrita pouco legível") com botão **Está correto** — é a regra *human-in-the-loop*.
- **RN-FIC-06** Conferência da soma: `soma dos domínios editados` vs `total escrito na ficha` (= total dos valores **gerados** no pendente). Mensagens exatas:
  - igual: `A soma dos domínios (X) confere com o total escrito na ficha (W/30).` (estilo ok)
  - diferente: `A soma dos domínios (X) é diferente do total escrito na ficha (W/30). Revise os valores.` (estilo warn)
  Atualiza a cada tecla.
- **RN-FIC-07** Botão **Confirmar ficha e atualizar evolução** só habilita com `campo sinalizado confirmado` **e** `soma confere`. Dica abaixo: "Tudo conferido." / "Confirme o campo sinalizado e a soma para liberar o botão."
- **RN-FIC-08** Confirmar: cria a avaliação com os valores editados (`Number(v) || 0`), limpa o pendente, marca `justConfirmed = data da ficha` (estado de UI, ver 7.7) e **vai para a aba Evolução e sugestões**. A API valida de novo: cada nota dentro de `[0, máx]` inteira, soma == total do pendente, `flagConfirmed == true` → senão `422` com as mesmas mensagens.
- **RN-FIC-09** As observações são editáveis na revisão, mas **não aparecem em nenhuma tela depois**. Pode-se persistir em `notes` da avaliação (invisível).
- **RN-FIC-10** Ao abrir um paciente com ficha pendente, a aba Fichas entra direto na revisão (campos preenchidos com os valores do pendente, `ext='idle'`, campo sinalizado não confirmado).

### 5.6 Evolução, tendência e sugestões

Definições (sobre `evals` ordenadas por inclusão):

- **RN-EVO-01 Tendência** (chip): `n=0` → `sem avaliações`; `n=1` → `primeira avaliação`; senão `d = total(última) − total(penúltima)`: `d>0` → classe `up`, `▲ subiu {d}`; `d<0` → `down`, `▼ caiu {|d|}`; `d=0` → `● estável`.
- **RN-EVO-02 Flags por domínio** (só com `n ≥ 2`): para cada domínio, `peak = max(valor em todas as avaliações)`, `peakDate = data da primeira avaliação que atingiu o pico`, `l = valor na última`, `fell = l < valor na penúltima`, `below = l < peak`, `score = (peak − l)/max`. Considera só os que têm `below`. Ordena por `fell` (true primeiro), depois `score` desc (empate: ordem dos domínios); **mantém os 3 primeiros**.
- **RN-EVO-03 Lista de sugestões** `sugList(paciente)`:
  - `n = 0` → `[]`
  - `n = 1` → 1 sugestão **Linha de base** (`key = {id}:base`), justificativa: `Primeira avaliação registrada em {data}. A comparação com avaliações anteriores começa na próxima ficha.`, fontes `[data]`.
  - `n ≥ 2` e nenhum flag → 1 sugestão **Manter e desafiar** (`key = {id}:keep`), justificativa: `Nenhum domínio ficou abaixo do melhor resultado registrado. O total passou de {total da 1ª} em {data da 1ª} para {total da última} em {data da última}.`, fontes `[1ª, última]`.
  - `n ≥ 2` com flags → 1 sugestão por flag (`key = {id}:{domínio}`), atividade da biblioteca do domínio, justificativa:
    `{NomeDomínio}: melhor resultado {peak}/{max} em {peakDate}, agora {l}/{max} em {lastDate}` + (`fell` ? ` (caiu desde a avaliação anterior).` : ` (segue abaixo do melhor resultado).`), fontes `[peakDate, lastDate]`.
- **RN-EVO-04 "Nova"**: a sugestão exibe o chip `Nova com a ficha de {data sem sufixo}` quando `fell == true` **e** a data da última avaliação == `justConfirmed` (UI). A API devolve `fell` e `lastDate`; o front decide o chip.
- **RN-EVO-05 Estados da sugestão** (por `key`, persistidos por paciente): `open` (padrão) → **Aceitar** → `ok`; **Recusar** → `no`; **Desfazer** (a partir de `no`) ou **Tirar da rotina** (a partir de `ok`) → `open`. `customText` opcional (texto editado). Estados **sobrevivem** a novas avaliações enquanto a `key` continuar sendo gerada.
- **RN-EVO-06 Rotina planejada** = sugestões **atualmente geradas** com estado `ok`; texto = `customText` ou texto padrão da biblioteca.
- **RN-EVO-07** Se há ficha pendente, a aba Evolução mostra o banner: `Há 1 ficha nova ({data}) aguardando conferência. A evolução abaixo ainda não a inclui.` + botão **Conferir ficha** (vai para Fichas). A evolução/sugestões **não** incluem o pendente.

### 5.7 Biblioteca de atividades (conteúdo fixo — seed/constante)

| Domínio | Título | Texto (`h`) | Duração | Frequência |
|---|---|---|---|---|
| `ori` | Ritual de orientação no início da sessão | Abrir a sessão com calendário, clima e rotina do dia, pedindo que a pessoa complete sozinha antes de receber a correção. | 5 min | a cada sessão |
| `reg` | Repetição de palavras encadeadas | Dizer três palavras do dia a dia e pedir a repetição imediata, aumentando uma palavra a cada acerto. | 8 min | 2x por semana |
| `ate` | Atenção sustentada: cancelamento de figuras | Riscar uma figura-alvo numa folha com figuras variadas, em tempo marcado, aumentando a densidade a cada semana. | 10 min | 3x por semana |
| `evo` | Evocação tardia com histórias de vida | Contar uma história curta ligada à vida da pessoa e pedir que reconte 10 minutos depois, com pistas de categoria. | 15 min | 2x por semana |
| `lin` | Fluência verbal por categorias | Pedir o maior número de itens de uma categoria em um minuto (frutas, ferramentas, cidades), variando a categoria. | 10 min | 2x por semana |
| `keep` | Manter e desafiar | Aumentar a complexidade das atividades atuais, por exemplo mais cartas no jogo de pares, e registrar o tempo de execução. | 15 min | 2x por semana |
| `base` | Linha de base: atividades de dificuldade média | Começar com uma atividade de dificuldade média em cada domínio e registrar o tempo e o apoio necessários, para ter parâmetros nas próximas avaliações. | 15 min | 2x por semana |

No card da sugestão, se o paciente tem `interests`: linha extra `Para personalizar (perfil do paciente): {interests}`.

---

## 6. Dados mocados → o que vira seed, regra ou constante

### 6.1 Usuários semente (RN-AUTH-01)

```json
[
  { "username": "admin", "name": "Administrador",  "role": "admin",        "password": "admin" },
  { "username": "prof1", "name": "Profissional 1", "role": "professional", "password": "prof1" },
  { "username": "prof2", "name": "Profissional 2", "role": "professional", "password": "prof2" }
]
```

### 6.2 Pacientes semente

Scores na ordem `{ori, reg, ate, evo, lin}`. `generationCursor` (k) começa em 0 para todos.

```json
[
  {
    "id": "014", "initials": "M.S.", "age": 78, "educationYears": 4,
    "group": "Grupo da manhã", "responsibleUsername": "prof1",
    "objective": "Manter atenção e memória no dia a dia",
    "interests": "Ex-costureira. Gosta de música antiga e de bordado.",
    "vision": "Leve", "hearing": "Sem limitação", "mobility": "Sem limitação",
    "phone": "(32) 99999-0014",
    "address": "Rua das Flores, 120, Centro, Juiz de Fora - MG",
    "emergencyContact": { "name": "Contato fictício A", "phone": "(32) 98888-0014", "relationship": "Filho(a)" },
    "evaluations": [
      { "date": "03/2026", "scores": { "ori": 9, "reg": 3, "ate": 3, "evo": 2, "lin": 8 } },
      { "date": "06/2026", "scores": { "ori": 9, "reg": 3, "ate": 4, "evo": 2, "lin": 8 } },
      { "date": "09/2026", "scores": { "ori": 8, "reg": 3, "ate": 3, "evo": 1, "lin": 8 } }
    ]
  },
  {
    "id": "021", "initials": "J.A.", "age": 82, "educationYears": 8,
    "group": "Individual", "responsibleUsername": "prof2",
    "objective": "Estimular a linguagem e a atenção",
    "interests": "Aposentado do comércio. Gosta de futebol e de dominó.",
    "vision": "Sem limitação", "hearing": "Leve", "mobility": "Leve",
    "phone": "(32) 99999-0021",
    "address": "Av. Exemplo, 455, apto 302, São Mateus, Juiz de Fora - MG",
    "emergencyContact": { "name": "Contato fictício B", "phone": "(32) 98888-0021", "relationship": "Cônjuge" },
    "evaluations": [
      { "date": "03/2026", "scores": { "ori": 8, "reg": 2, "ate": 2, "evo": 1, "lin": 7 } },
      { "date": "06/2026", "scores": { "ori": 8, "reg": 3, "ate": 2, "evo": 1, "lin": 7 } },
      { "date": "09/2026", "scores": { "ori": 8, "reg": 3, "ate": 3, "evo": 1, "lin": 7 } }
    ]
  },
  {
    "id": "009", "initials": "R.L.", "age": 74, "educationYears": 11,
    "group": "Grupo da tarde", "responsibleUsername": "prof1",
    "objective": "Preservar a atenção e a evocação",
    "interests": "Professora aposentada. Gosta de leitura e de jardinagem.",
    "vision": "Leve", "hearing": "Sem limitação", "mobility": "Sem limitação",
    "phone": "(32) 99999-0009",
    "address": "Rua Modelo, 87, Santa Helena, Juiz de Fora - MG",
    "emergencyContact": { "name": "Contato fictício C", "phone": "(32) 98888-0009", "relationship": "Neto(a)" },
    "evaluations": [
      { "date": "03/2026", "scores": { "ori": 10, "reg": 3, "ate": 5, "evo": 2, "lin": 8 } },
      { "date": "06/2026", "scores": { "ori": 10, "reg": 3, "ate": 4, "evo": 3, "lin": 8 } },
      { "date": "09/2026", "scores": { "ori": 10, "reg": 3, "ate": 4, "evo": 2, "lin": 8 } }
    ]
  }
]
```

Totais: 014 → 25, 26, 23 · 021 → 20, 21, 22 · 009 → 28, 28, 27. Ordem na lista: 014, 021, 009 (ordem de inserção).

### 6.3 Extrator "Mágico de Oz" (`MagicOzFichaExtractor`) — regra exata

Constantes:

```ts
BASE         = { ori: 9, reg: 3, ate: 4, evo: 2, lin: 8 }            // 1ª ficha de paciente sem avaliações
SCRIPT       = {
  '014': [ { ate: -1 }, { evo: +1 }, { ori: +1 } ],
  '021': [ { evo: +1 }, { ori: +1 }, { lin: -1 } ],
  '009': [ { ate: -1 }, { evo: -1 }, { ori: -1 } ],
}
DEF_SCRIPT   = [ { ate: -1 }, { evo: +1 }, { ori: -1 }, { lin: +1 } ]  // demais pacientes
OBS_FIRST    = 'Primeira avaliação. Colaborou bem durante a sessão.'
OBS_UP       = 'Mais participativo hoje. Concluiu a atividade sem pausas.'
OBS_DOWN     = 'Relata cansaço e esquecimento de recados. Participou do jogo de pares.'
```

Algoritmo `generate(patient, date)`:
1. Sem avaliações → `scores = BASE`, `flag = 'ate'`, `obs = OBS_FIRST`. **Não** avança `generationCursor`.
2. Senão: `step = (SCRIPT[patient.id] ?? DEF_SCRIPT)[generationCursor % script.length]`; **incrementa `generationCursor`**; `scores = cópia da última avaliação`; aplica o delta do domínio do passo com *clamp* em `[0, max]`; `flag = esse domínio`; `obs = delta > 0 ? OBS_UP : OBS_DOWN`.
3. Retorna `PendingFicha { date, scores, flag, obs }`. O campo `flag` é o domínio "sinalizado" da revisão.

Resultados esperados (usar como **testes de aceitação**):

| Cenário | Resultado |
|---|---|
| Paciente 014 (semente), 1º envio | `ate 3→2`, flag `ate`, total escrito 22; ao confirmar: tendência `▼ caiu 1`; sugestões na ordem: **Atenção sustentada** (nova, caiu), **Evocação tardia**, **Ritual de orientação** |
| 014 sem enviar nada (estado semente) | 3 sugestões, ordem: Evocação tardia (score .33), Atenção sustentada (.2), Ritual de orientação (.1) — todas "caiu" |
| 021 (semente) | nenhum flag → 1 sugestão **Manter e desafiar** |
| 009 (semente) | flag `evo` (3→2, caiu) e `ate` (peak 5, agora 4) |
| Paciente novo, 1º envio | scores `{9,3,4,2,8}` (total 26), flag `ate`; ao confirmar: 1 sugestão **Linha de base**; Início mostra tendência `primeira avaliação` |
| Paciente novo, 2º envio | usa `DEF_SCRIPT[0]` → `ate 4→3` |
| Início como `admin` (semente) | Pacientes no sistema `3`, Profissionais cadastrados `2`, Fichas aguardando `0`, Quedas recentes `2` (014 e 009), Atividades na rotina `0`; "Para fazer hoje": 2 linhas (014, 009) tag **Atenção** |

---

## 7. Telas, componentes e botões (front) → ações → API

Legenda de ação: o nome em `código` é o `data-act` do protótipo (para você localizar no HTML de referência).

### 7.1 Auth (`/login`, `/cadastro`, `/quero-testar`)

Cartão central (`.auth .panel`): logo+nome, título, subtítulo, formulário, links.

**Login** — título "Entrar", subtítulo "Acesse para acompanhar seus pacientes."
- Campos: Usuário (`autocomplete=username`), Senha (`password`).
- Botão **Entrar** (submit; Enter também envia) → `POST /auth/login`.
- Erro: nota `warn` com `role="alert"` (mensagens RN-AUTH-02).
- Link "Ainda não tem conta? **Criar conta**" (`authmode:signup`).
- Caixa tracejada (`.cta`): "**Quer testar o Mente Ativa?**" / "Deixe seu contato e avisamos quando houver vaga." / botão **Quero testar** (`authmode:lead`).
- Nota: "Acesso de demonstração: usuário **admin**, senha **admin**." (manter; controlar por `VITE_SHOW_DEMO_HINT=true`).

**Criar conta** — título "Criar conta", subtítulo "Cadastre-se para acompanhar seus pacientes."
- Campos: Nome, Usuário, Senha, Confirmar senha. Botão **Criar conta** → `POST /auth/signup`. Link "Já tem conta? **Entrar**".

**Quero testar** — título "Quero testar o Mente Ativa"; subtítulo "Acompanhe a evolução cognitiva dos seus pacientes e planeje a rotina de atividades. Deixe seu contato e liberamos um acesso de teste na hora, sem pacientes cadastrados."
- Campos: Nome; Telefone (WhatsApp) `tel` placeholder `(32) 90000-0000`; E-mail `email` placeholder `nome@exemplo.com`; Como você atua? (select); Onde você atua (opcional) placeholder `Ex.: clínica, ILPI, centro-dia`; checkbox "Autorizo o contato sobre o teste do Mente Ativa. Uso estes dados só para isso."
- Texto pequeno: "Seu acesso: usuário = seu primeiro nome. Senha = os 4 últimos dígitos do telefone."
- Botão **Quero testar** → `POST /auth/trial-access` (estado "Enviando…" desabilitado durante a chamada). Link "Voltar ao login".
- Sucesso → autentica, vai para `/` e abre o **pop-up** (8.1).

### 7.2 Início (`/`)

- Cabeçalho: `h1` = `{Bom dia|Boa tarde|Boa noite}, {nome do usuário}` (hora local do navegador: <12 / <18 / resto) e "Resumo de hoje, {dd/mm/yyyy}". Botões: **Novo paciente** (primário → `/pacientes/novo`) e **Ver pacientes** (→ `/pacientes`).
- **KPIs** (grade 4 colunas auto-fit, mín. 170px) — `GET /dashboard/summary`:
  1. `{n}` "Pacientes no sistema" (admin) / "Pacientes acompanhados" (profissional) — pacientes visíveis;
  2. **somente admin:** `{n}` "Profissionais cadastrados" (usuários não-admin);
  3. `{n}` "Fichas aguardando conferência" (estilo `warn` se > 0);
  4. `{n}` "Pacientes com queda recente" (estilo `warn` se > 0) — pacientes com ≥ 1 flag `fell`;
  5. `{n}` "Atividades na rotina" — soma dos itens com estado `ok` entre as sugestões vigentes.
- **"Para fazer hoje"** — lista (para cada paciente visível, nesta ordem de geração das linhas):
  - se tem pendente → "Ficha nova de {data} aguardando conferência" · chip `warn` **Ficha nova** · botão **Conferir ficha** → `/pacientes/:id/fichas`;
  - senão, se sem avaliações → "Ainda sem avaliações. Envie a primeira ficha." · chip (neutro) **Sem avaliações** · botão **Enviar ficha** → fichas;
  - e (adicional), se tem flags `fell` e **não** tem pendente → "Queda desde a avaliação anterior em: {nomes dos domínios, separados por ", "}" · chip `down` **Atenção** · botão **Ver sugestões** → `/pacientes/:id/evolucao`.
  Cada linha: `{id} · {iniciais}, {idade} anos` em negrito + descrição. Vazio: "Nada pendente. Envie uma nova ficha em um paciente para atualizar a evolução."
- Caixa **Roteiro do demo (2 minutos)** com os 4 passos (manter literal):
  1. Abra um paciente e clique em Enviar nova ficha.
  2. Peça a extração, confira os campos e a fonte de cada um.
  3. Confirme a ficha e veja a evolução se atualizar.
  4. Aceite, edite ou recuse as sugestões e monte a rotina.

### 7.3 Pacientes (`/pacientes`)

- Cabeçalho "Pacientes" + botão **Novo paciente** (→ `/pacientes/novo`); subtítulo "Identificados só por código e iniciais. O protótipo usa fichas e pontuações de exemplo."
- Lista (`GET /patients`): cada linha é um botão (abre `/pacientes/:id`, aba Fichas):
  `código` · **`{iniciais}, {idade} anos`** + `{modalidade}` + (admin: ` · Responsável: {nome}`) + ` · ` + (`última avaliação {data}` | `aguardando a primeira ficha`) · `MEEM {total}/30` ou `—` · chip de tendência (RN-EVO-01) · chip `warn` "1 ficha nova" se pendente.
- Vazio: "Nenhum paciente cadastrado" / "Cadastre o primeiro paciente para enviar fichas e acompanhar a evolução."
- Sem busca/filtro (não existe no protótipo; **não adicionar**).

### 7.4 Paciente (`/pacientes/:id/...`)

Cabeçalho: migalha "Pacientes / Paciente {id}" (link volta à lista); `h1` "Paciente {id} · {iniciais}, {idade} anos"; subtítulo: `{modalidade}` + (`edu` informada ? ` · {n} anos de estudo`) + ` · Responsável: {nome} · Instrumento de exemplo: MEEM (0 a 30)`. Abas: **Fichas**, **Evolução e sugestões**, **Dados do paciente**.

**Aba Fichas — sem pendente** (`GET /patients/:id/fichas`)
- Banner `ok` (se `justConfirmed`): "Ficha de {data} confirmada. A evolução e as sugestões foram atualizadas."
- Painel "Fichas deste paciente": tabela Data | Instrumento (`MEEM`) | Total (`x/30`) | Situação (chip `up` "Conferida"), **mais recente primeiro**. Vazio: "Nenhuma ficha enviada ainda."
- Painel tracejado "**Enviar nova ficha**": "No produto: foto, PDF ou planilha. No protótipo, o botão gera uma ficha de exemplo para este paciente." + botão **Enviar nova ficha** (`upload`) → `POST /patients/:id/fichas/upload`. Durante 1,1 s: "Recebendo a ficha…" com passos "Arquivo recebido ✓" / "Preparando a leitura".
- Botão **Ver evolução e sugestões** (só se há fichas) → aba Evolução.

**Aba Fichas — com pendente** (layout dividido: ficha à esquerda, painel à direita; 1 coluna ≤ 760px)
- **Ficha manuscrita** (fonte Caveat, papel levemente rotacionado, sombra), 10 linhas, ids `l0..l9`:
  `l0` "Ficha de avaliação" (título) · `l1` "Data: {dd/mm/yyyy}" + "Pac. {id}" · `l2` "Instrumento: MEEM" · `l3..l7` cada domínio + "`{valor} /{max}`" · `l8` "Total" "`{total} /30`" · `l9` "Obs: {texto}". Nota abaixo: "Ficha de exemplo, escrita à mão. No produto: foto, PDF ou planilha."
  A ficha exibe os valores **gerados** (não os editados).
- **Painel de extração** (`ext`): 
  - `idle`: "Extração dos dados" / "A IA lê a ficha e preenche os campos. Você confere cada um antes de salvar." + botão **Extrair dados com IA** (`extract`).
  - `run`: "Extraindo…" + 3 passos que vão ficando concluídos a cada 650 ms.
  - `review`: "Dados extraídos": campo "Data da avaliação" (somente leitura, fonte linha 1), 5 campos numéricos (rótulo "`{Domínio}` (máx. `{max}`)", "Fonte: linha N da ficha"), o sinalizado com botão **Está correto** (`okate`) e texto "· baixa confiança, escrita pouco legível"; caixa de conferência da soma (RN-FIC-06); textarea "Observações" (fonte linha 10); botão **Confirmar ficha e atualizar evolução** (`confirm`, RN-FIC-07) + dica.
  - **Realce cruzado:** ao focar/passar o mouse num campo, a linha correspondente da ficha ganha fundo amarelo (`ori→l3, reg→l4, ate→l5, evo→l6, lin→l7, data→l1, obs→l9`).
- `confirm` → `POST /patients/:id/fichas/pending/confirm` → vai para Evolução.

**Aba Evolução e sugestões** (`GET /patients/:id/evolution`)
- Banner de pendente (RN-EVO-07). Sem avaliações: painel "Ainda não há avaliações" / "Envie a primeira ficha deste paciente para ver a evolução e receber sugestões." + botão **Ir para as fichas**.
- Painel **Evolução do total (MEEM)**: gráfico SVG de linha (eixo Y 16–30 com grades em 18/22/26/30; pontos com o total acima e a data embaixo; último ponto preenchido). Legenda: "Pontuação de 0 a 30. Dados fictícios de exemplo." + (se 1 avaliação) " Esta é a primeira avaliação; a comparação começa na próxima ficha."
- Painel **O que mudou desde a avaliação anterior** (só com ≥ 2): tabela Domínio | `{data penúltima}` | `{data última}` | Variação (chip `▲ subiu N` / `▼ caiu N` / `● igual`).
- **Sugestões para a rotina** (RN-EVO-03..05): card com título, chips (`Nova com a ficha de {data}`, `Na rotina`, `Recusada`), texto, `{dur} · {freq}`, linha "Para personalizar…", caixa **"Por que esta sugestão:"** + chips de fonte (`avaliação {data}`), ações:
  - estado aberto: **Aceitar** (`accept`), **Editar** (`edit`), **Recusar** (`reject`);
  - `ok`: **Tirar da rotina** (`undo`), **Editar**;
  - `no`: só título + **Desfazer** (`undo`), card esmaecido;
  - editando: textarea "Ajuste a atividade" + **Salvar** (`saveedit`) / **Cancelar** (`canceledit`). Editar é estado de UI até salvar.
- Painel **Rotina planejada**: lista (título + `{dur} · {freq}`) das aceitas; vazio: "Aceite sugestões para montar a rotina da semana deste paciente."

**Aba Dados do paciente**
- Painel "Perfil" + botão **Editar dados** (→ `/pacientes/:id/editar`); seções (rótulo → valor, "Não informado" quando vazio): **Pessoa** (Iniciais, Idade "N anos", Escolaridade "N anos de estudo", Interesses e história de vida) · **Contato** (Telefone, Endereço) · **Contato de emergência** (Nome, Telefone, Grau de parentesco) · **Funcional** (Visão, Audição, Mobilidade) · **Contexto** (Modalidade, Profissional responsável = nome do responsável, Objetivo da estimulação).
- **Excluir paciente** (botão `danger`, `delask`) → caixa `warn`: "Excluir o paciente {id}? Isso remove as fichas, a evolução e as sugestões dele." + **Sim, excluir** (`delyes`, `danger`) / **Cancelar** (`delno`) → `DELETE /patients/:id` → volta à lista.

### 7.5 Formulário de paciente (`/pacientes/novo`, `/pacientes/:id/editar`)

Título "Novo paciente" ou "Editar dados do paciente {id}"; migalha (Pacientes / Novo — ou — Paciente {id} / Editar dados); subtítulo = RN-PAT-06. Seções e campos (mesma ordem):

| Seção | Campo (rótulo) | Tipo |
|---|---|---|
| Pessoa | Iniciais * (máx 10, ph "Ex.: M.S.") · Idade * (number, ph "Ex.: 78") · Escolaridade (anos de estudo) (number, ph "Ex.: 4", dica "A escolaridade ajuda a interpretar a pontuação.") · Interesses e história de vida (textarea, dica "Profissão, hobbies e músicas preferidas ajudam a personalizar as atividades.") | |
| Contato | Telefone (tel, ph "(32) 90000-0000") · Endereço (ph "Rua, número, bairro, cidade") | |
| Contato de emergência | Nome * · Telefone * (tel) · Grau de parentesco (select) | |
| Funcional | Visão · Audição · Mobilidade (selects) | |
| Contexto | Modalidade (select) · Profissional responsável (somente leitura) · Objetivo da estimulação (ph "Ex.: Manter a atenção no dia a dia") | |

Botões: **Salvar** (`pfsave`) → `POST /patients` ou `PUT /patients/:id`; **Cancelar** (`pfcancel`). Erro de validação: nota `warn` no fim do formulário (uma mensagem por vez, RN-PAT-04).
Pós-ação: novo → abre o paciente na aba **Fichas**; editar → aba **Dados do paciente**; cancelar novo → lista; cancelar editar → Dados.

### 7.6 Rotinas (`/rotinas`) — `GET /routines`

- "Rotinas" / "Atividades aceitas pelo profissional, por paciente. Aceite sugestões na aba Evolução e sugestões de cada paciente."
- Um painel por paciente visível **com ao menos 1 aceita**: título `{id} · {iniciais}, {idade} anos` + botão **Abrir paciente** (→ Evolução); itens: **título** + texto (custom ou padrão) em cinza + `{dur} · {freq}` à direita.
- Vazio: "Nenhuma atividade aceita ainda. Abra um paciente, envie uma ficha e aceite as sugestões para montar a rotina."

### 7.7 Usuários (`/usuarios`, só admin) — `GET /users` + `GET /leads`

- "Usuários" / "Quem tem acesso ao sistema e quantos pacientes cada um acompanha. Apenas administradores veem esta tela."
- Tabela: Nome | Usuário | Perfil (`Administrador`/`Profissional`) | Pacientes (qtde onde é responsável; inclui admin).
- Seção **Pedidos de teste ("Quero testar")** / "Contatos deixados na tela de login. Só o dono da página vê esta lista." Tabela: Nome | Telefone | E-mail | Usuário | Atuação | Local | Data (`pt-BR`). Vazio: "Nenhum pedido recebido ainda."

### 7.8 Estado só de UI (Zustand) — **não** vai para a API

`authMode`, rascunhos de formulários/erros, `okAte` (campo sinalizado confirmado), `ext` (`idle|run|review`) e `step`, valores editados da revisão (`vals`), `up` (`idle|run`, 1,1 s), `editing` por sugestão, `confirmDel`, `justConfirmed` (data da última ficha confirmada **na sessão**), `welcome` (pop-up), aba ativa. Observação: no protótipo `justConfirmed` nunca é limpo até recarregar; manter em memória (não persistir) para o comportamento ser idêntico.

---

## 8. Pop-up de boas-vindas

### 8.1 Após "Quero testar"

Modal centralizado sobre a Home (fundo `rgba(0,0,0,.55)`, cartão 440px máx., raio 16, foco automático no botão):

- Título: **Bem-vindo(a), {primeiro nome}!**
- "Seu acesso de teste ao Mente Ativa está liberado. Anote seus dados para entrar nas próximas vezes:"
- Bloco destacado (`accent-soft`): **Usuário** `{usuário}` · **Senha** `{4 dígitos}`
- "Você começa sem nenhum paciente cadastrado. Use "Novo paciente" para criar o primeiro."
- Botão **Entendi** (`closewelcome`). Fecha também com **Esc**. Some ao fazer logout.

---

## 9. Contrato da API (REST, JSON) — payloads com os dados do mock

Base: `/api/v1`. Auth: `Authorization: Bearer <jwt>` (payload `{ sub: username, role }`, expira em 8h). Datas de avaliação são **strings de exibição** (`"dd/mm/yyyy"`, `"mm/yyyy"` nas sementes, com sufixo ` #n` quando repetida). `id` do paciente é o **código** (`"014"`).

**Erro padrão** (HTTP 4xx):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Informe as iniciais do paciente.", "field": "initials" } }
```
Códigos: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409). **A mensagem é a do protótipo (pt-BR)** para o front exibir direto.

### 9.1 Auth

**POST `/auth/login`**
```json
// req
{ "username": "admin", "password": "admin" }
// 200
{ "token": "<jwt>", "user": { "username": "admin", "name": "Administrador", "role": "admin" } }
// 401
{ "error": { "code": "UNAUTHORIZED", "message": "Usuário ou senha incorretos." } }
```

**POST `/auth/signup`**
```json
// req
{ "name": "Etiene Soares", "username": "etiene", "password": "abcd", "passwordConfirmation": "abcd" }
// 201
{ "token": "<jwt>", "user": { "username": "etiene", "name": "Etiene Soares", "role": "professional" } }
// 422 (exemplos)
{ "error": { "code": "VALIDATION_ERROR", "message": "Este usuário já existe. Escolha outro.", "field": "username" } }
```

**POST `/auth/trial-access`** ("Quero testar")
```json
// req
{
  "name": "Ágata Souza",
  "phone": "(32) 9 1234-5678",
  "email": "agata@exemplo.com",
  "profile": "Fisioterapeuta",
  "workplace": "Clínica Vida",
  "consent": true
}
// 201
{
  "token": "<jwt>",
  "user": { "username": "agata", "name": "Ágata Souza", "role": "professional" },
  "credentials": { "username": "agata", "password": "5678" }   // exibido uma única vez no pop-up; nunca mais recuperável
}
// 422 (exemplos): "Informe um telefone com DDD." | "Informe um e-mail válido." | "Marque a autorização para receber o contato."
```

**GET `/auth/me`** → `{ "user": { "username", "name", "role" } }` (revalida a sessão ao recarregar).

### 9.2 Pacientes

**GET `/patients`** (filtra por RN-PAT-01)
```json
// 200 — admin
{
  "items": [
    {
      "id": "014", "initials": "M.S.", "age": 78, "group": "Grupo da manhã",
      "responsibleUsername": "prof1", "responsibleName": "Profissional 1",
      "lastEvaluationDate": "09/2026", "lastTotal": 23,
      "trend": { "kind": "down", "label": "▼ caiu 3", "delta": -3 },
      "hasPending": false
    },
    {
      "id": "021", "initials": "J.A.", "age": 82, "group": "Individual",
      "responsibleUsername": "prof2", "responsibleName": "Profissional 2",
      "lastEvaluationDate": "09/2026", "lastTotal": 22,
      "trend": { "kind": "up", "label": "▲ subiu 1", "delta": 1 },
      "hasPending": false
    },
    {
      "id": "009", "initials": "R.L.", "age": 74, "group": "Grupo da tarde",
      "responsibleUsername": "prof1", "responsibleName": "Profissional 1",
      "lastEvaluationDate": "09/2026", "lastTotal": 27,
      "trend": { "kind": "down", "label": "▼ caiu 1", "delta": -1 },
      "hasPending": false
    }
  ]
}
```
`trend.kind`: `up | down | stable | first | none` (rótulos RN-EVO-01: `"● estável"`, `"primeira avaliação"`, `"sem avaliações"`).

**POST `/patients`** → `201` com o paciente completo (abaixo). Responsável = usuário do token (RN-PAT-02).
```json
{
  "initials": "K.K.",
  "age": 70,
  "educationYears": 5,
  "interests": "Gosta de samba",
  "phone": "(32) 99999-1111",
  "address": "Rua X, 1",
  "emergencyContact": { "name": "Fulano", "phone": "32988887777", "relationship": "Filho(a)" },
  "vision": "Sem limitação", "hearing": "Sem limitação", "mobility": "Sem limitação",
  "group": "Individual",
  "objective": "Manter a atenção no dia a dia"
}
```

**GET `/patients/:id`** → `200` (404 se não visível)
```json
{
  "id": "014", "initials": "M.S.", "age": 78, "educationYears": 4,
  "interests": "Ex-costureira. Gosta de música antiga e de bordado.",
  "phone": "(32) 99999-0014", "address": "Rua das Flores, 120, Centro, Juiz de Fora - MG",
  "emergencyContact": { "name": "Contato fictício A", "phone": "(32) 98888-0014", "relationship": "Filho(a)" },
  "vision": "Leve", "hearing": "Sem limitação", "mobility": "Sem limitação",
  "group": "Grupo da manhã", "objective": "Manter atenção e memória no dia a dia",
  "responsibleUsername": "prof1", "responsibleName": "Profissional 1",
  "hasPending": false, "evaluationCount": 3
}
```

**PUT `/patients/:id`** — substitui os campos editáveis (mesmo corpo do POST). Ignora/recusa `responsibleUsername`, `id`, avaliações. `200` com o paciente. *(Opcional: `PATCH` para parcial, mesmas validações.)*

**DELETE `/patients/:id`** → `204` (cascata, RN-PAT-07).

### 9.3 Fichas

**GET `/patients/:id/fichas`**
```json
{
  "evaluations": [                      // mais recente primeiro
    { "date": "09/2026", "instrument": "MEEM", "total": 23, "status": "Conferida" },
    { "date": "06/2026", "instrument": "MEEM", "total": 26, "status": "Conferida" },
    { "date": "03/2026", "instrument": "MEEM", "total": 25, "status": "Conferida" }
  ],
  "pending": null
}
```

**POST `/patients/:id/fichas/upload`** — Mágico de Oz (RN-FIC-02/03). Corpo vazio (no produto real: `multipart` com o arquivo; aceitar e ignorar um `file` opcional).
```json
// 201 — paciente 014, 1º envio
{
  "pending": {
    "date": "17/10/2026",
    "scores": { "ori": 8, "reg": 3, "ate": 2, "evo": 1, "lin": 8 },
    "writtenTotal": 22,
    "flag": "ate",
    "observations": "Relata cansaço e esquecimento de recados. Participou do jogo de pares.",
    "sheetLines": [
      { "id": "l0", "title": "Ficha de avaliação" },
      { "id": "l1", "left": "Data: 17/10/2026", "right": "Pac. 014" },
      { "id": "l2", "left": "Instrumento: MEEM" },
      { "id": "l3", "left": "Orientação", "right": "8 /10" },
      { "id": "l4", "left": "Memória imediata", "right": "3 /3" },
      { "id": "l5", "left": "Atenção e cálculo", "right": "2 /5" },
      { "id": "l6", "left": "Evocação", "right": "1 /3" },
      { "id": "l7", "left": "Linguagem", "right": "8 /9" },
      { "id": "l8", "left": "Total", "right": "22 /30" },
      { "id": "l9", "left": "Obs: Relata cansaço e esquecimento de recados. Participou do jogo de pares." }
    ]
  }
}
// 409 se já existe pendente
{ "error": { "code": "CONFLICT", "message": "Já existe uma ficha aguardando conferência." } }
```
(`sheetLines` é opcional — o front pode montá-las; incluí para garantir paridade com o desenho da ficha.)

**GET `/patients/:id/fichas/pending`** → mesmo objeto `pending` (ou `404` se não há).

**POST `/patients/:id/fichas/pending/confirm`** (RN-FIC-06/07/08)
```json
// req — valores conferidos/editados pelo profissional
{
  "scores": { "ori": 8, "reg": 3, "ate": 2, "evo": 1, "lin": 8 },
  "observations": "Relata cansaço e esquecimento de recados. Participou do jogo de pares.",
  "flagConfirmed": true
}
// 201
{
  "evaluation": { "date": "17/10/2026", "total": 22 },
  "justConfirmed": "17/10/2026"
}
// 422 (exemplos)
{ "error": { "code": "VALIDATION_ERROR", "message": "A soma dos domínios (21) é diferente do total escrito na ficha (22/30). Revise os valores.", "field": "scores" } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Confirme o campo sinalizado e a soma para liberar o botão.", "field": "flagConfirmed" } }
```

### 9.4 Evolução e sugestões

**GET `/patients/:id/evolution`** — exemplo: paciente **014 depois do 1º envio confirmado** (data de hoje 17/10/2026)
```json
{
  "hasPending": false,
  "pendingDate": null,
  "series": [
    { "date": "03/2026", "total": 25 },
    { "date": "06/2026", "total": 26 },
    { "date": "09/2026", "total": 23 },
    { "date": "17/10/2026", "total": 22 }
  ],
  "delta": {
    "previousDate": "09/2026", "lastDate": "17/10/2026",
    "rows": [
      { "domain": "ori", "name": "Orientação",        "previous": 8, "last": 8, "max": 10, "kind": "same", "label": "● igual" },
      { "domain": "reg", "name": "Memória imediata",  "previous": 3, "last": 3, "max": 3,  "kind": "same", "label": "● igual" },
      { "domain": "ate", "name": "Atenção e cálculo", "previous": 3, "last": 2, "max": 5,  "kind": "down", "label": "▼ caiu 1" },
      { "domain": "evo", "name": "Evocação",          "previous": 1, "last": 1, "max": 3,  "kind": "same", "label": "● igual" },
      { "domain": "lin", "name": "Linguagem",         "previous": 8, "last": 8, "max": 9,  "kind": "same", "label": "● igual" }
    ]
  },
  "suggestions": [
    {
      "key": "014:ate",
      "title": "Atenção sustentada: cancelamento de figuras",
      "defaultText": "Riscar uma figura-alvo numa folha com figuras variadas, em tempo marcado, aumentando a densidade a cada semana.",
      "duration": "10 min", "frequency": "3x por semana",
      "why": "Atenção e cálculo: melhor resultado 4/5 em 06/2026, agora 2/5 em 17/10/2026 (caiu desde a avaliação anterior).",
      "sources": ["06/2026", "17/10/2026"],
      "fell": true, "lastDate": "17/10/2026",
      "interests": "Ex-costureira. Gosta de música antiga e de bordado.",
      "state": { "status": "open", "customText": null }
    },
    { "key": "014:evo", "title": "Evocação tardia com histórias de vida", "...": "..." },
    { "key": "014:ori", "title": "Ritual de orientação no início da sessão", "...": "..." }
  ],
  "routine": []
}
```
`series`/`delta` só existem com avaliações (≥ 2 para `delta`). `routine` = sugestões com `status:"ok"` (campos: `key,title,text,duration,frequency`).

**PATCH `/patients/:id/suggestions/:key`** (aceitar/recusar/desfazer/salvar texto)
```json
// Aceitar
{ "status": "ok" }
// Recusar
{ "status": "no" }
// Desfazer / Tirar da rotina
{ "status": "open" }
// Salvar edição do texto
{ "customText": "Cancelamento de figuras com 12 itens-alvo, em 8 minutos." }
// 200
{ "key": "014:ate", "status": "ok", "customText": null }
// 404 se a key não é gerada atualmente para o paciente
```

### 9.5 Rotinas

**GET `/routines`**
```json
{
  "items": [
    {
      "patientId": "014", "initials": "M.S.", "age": 78,
      "activities": [
        { "key": "014:ate", "title": "Atenção sustentada: cancelamento de figuras",
          "text": "Riscar uma figura-alvo numa folha ...", "duration": "10 min", "frequency": "3x por semana" }
      ]
    }
  ]
}
```
(só pacientes visíveis com ≥ 1 atividade aceita.)

### 9.6 Início

**GET `/dashboard/summary`** — exemplo (estado semente, como `admin`)
```json
{
  "greetingName": "Administrador",
  "kpis": {
    "patients": 3,
    "professionals": 2,              // presente só para admin
    "pendingFichas": 0,
    "recentDrops": 2,
    "routineActivities": 0
  },
  "todo": [
    { "patientId": "014", "initials": "M.S.", "age": 78, "kind": "drop",
      "text": "Queda desde a avaliação anterior em: Evocação, Atenção e cálculo, Orientação",
      "tag": "Atenção", "tagStyle": "down", "button": "Ver sugestões", "targetTab": "evolucao" },
    { "patientId": "009", "initials": "R.L.", "age": 74, "kind": "drop",
      "text": "Queda desde a avaliação anterior em: Evocação",
      "tag": "Atenção", "tagStyle": "down", "button": "Ver sugestões", "targetTab": "evolucao" }
  ]
}
```
Tipos de `todo.kind`: `pending` (tag "Ficha nova", `warn`, botão "Conferir ficha", tab `fichas`), `first` (tag "Sem avaliações", botão "Enviar ficha", tab `fichas`), `drop` (tag "Atenção", `down`, botão "Ver sugestões", tab `evolucao`). O texto de `drop` lista **apenas os domínios com `fell`**, na ordem dos flags (RN-EVO-02): no estado semente o 014 lista "Evocação, Atenção e cálculo, Orientação" e o 009 lista só "Evocação" (o `ate` do 009 está abaixo do pico, mas não caiu na última avaliação — por isso não entra). Para cada paciente, a linha `pending`/`first` vem **antes** da linha `drop`; `drop` só existe se **não** há pendente.

### 9.7 Usuários e pedidos de teste (admin)

**GET `/users`** (admin; 403 caso contrário)
```json
{ "items": [
  { "username": "admin", "name": "Administrador",  "role": "admin",        "patientCount": 0 },
  { "username": "prof1", "name": "Profissional 1", "role": "professional", "patientCount": 2 },
  { "username": "prof2", "name": "Profissional 2", "role": "professional", "patientCount": 1 }
]}
```

**GET `/leads`** (admin; mais recentes primeiro)
```json
{ "items": [
  { "name": "Ágata Souza", "phone": "(32) 9 1234-5678", "email": "agata@exemplo.com",
    "profile": "Fisioterapeuta", "workplace": "Clínica Vida", "username": "agata",
    "createdAt": "2026-10-17T23:41:07.000Z" }
]}
```

### 9.8 Utilitários

- **GET `/meta/options`** (público/autenticado): enums (`groups`, `limitations`, `relationships`, `trialProfiles`), domínios MEEM. Opcional — o front pode usar `packages/shared`.
- **POST `/demo/reset`** (admin): restaura usuários/pacientes **semente** (seção 6) e apaga contas/pacientes/leads criados. Equivale a "recarregar a página" do protótipo, útil para demonstrações. Também `npm run seed`.
- **GET `/health`**.

### 9.9 Matriz botão → rota → endpoint

| Botão / ação | Rota front | Endpoint |
|---|---|---|
| Entrar | `/login` | `POST /auth/login` |
| Criar conta | `/cadastro` | `POST /auth/signup` |
| Quero testar (enviar) | `/quero-testar` | `POST /auth/trial-access` |
| Sair | menu | (limpa token e cache) |
| Novo paciente | `/`, `/pacientes` | navega `/pacientes/novo` |
| Salvar (novo) | `/pacientes/novo` | `POST /patients` |
| Editar dados | `/pacientes/:id/dados` | navega `/pacientes/:id/editar` |
| Salvar (editar) | `/pacientes/:id/editar` | `PUT /patients/:id` |
| Excluir → Sim, excluir | `/pacientes/:id/dados` | `DELETE /patients/:id` |
| Enviar nova ficha | fichas | `POST /patients/:id/fichas/upload` |
| Extrair dados com IA | fichas | *(só animação; dados já vieram no upload)* |
| Está correto | fichas | *(estado de UI; enviado como `flagConfirmed` no confirm)* |
| Confirmar ficha… | fichas | `POST /patients/:id/fichas/pending/confirm` |
| Aceitar / Recusar / Desfazer / Tirar da rotina | evolução | `PATCH /patients/:id/suggestions/:key` `{status}` |
| Editar → Salvar | evolução | `PATCH /patients/:id/suggestions/:key` `{customText}` |
| Conferir ficha / Ver sugestões / Enviar ficha (Início) | `/` | navegação |
| Abrir paciente (Rotinas) | `/rotinas` | navega `/pacientes/:id/evolucao` |
| Entendi (pop-up) | `/` | (fecha) |

---

## 10. MongoDB — modelo e índices

Coleções (`mente-ativa`):

**`users`**
```json
{ "_id": "ObjectId", "username": "prof1", "name": "Profissional 1", "role": "professional",
  "passwordHash": "<bcrypt>", "origin": "seed|signup|trial", "createdAt": "ISODate" }
```
Índice único `username`.

**`patients`** (agregado; avaliações embutidas)
```json
{
  "_id": "ObjectId", "code": "014",
  "initials": "M.S.", "age": 78, "educationYears": 4, "interests": "…",
  "phone": "…", "address": "…",
  "emergencyContact": { "name": "…", "phone": "…", "relationship": "Filho(a)" },
  "vision": "Leve", "hearing": "Sem limitação", "mobility": "Sem limitação",
  "group": "Grupo da manhã", "objective": "…",
  "responsibleUsername": "prof1",
  "generationCursor": 0,
  "evaluations": [ { "date": "09/2026", "scores": { "ori": 8, "reg": 3, "ate": 3, "evo": 1, "lin": 8 }, "notes": null, "createdAt": "ISODate" } ],
  "pending": { "date": "17/10/2026", "scores": { … }, "writtenTotal": 22, "flag": "ate", "observations": "…", "createdAt": "ISODate" } ,
  "suggestionStates": { "014:ate": { "status": "ok", "customText": null } },
  "createdAt": "ISODate", "updatedAt": "ISODate"
}
```
Índices: único `code`; `responsibleUsername`. `pending` = `null` quando não há. Atualizações de `evaluations/pending/generationCursor` devem ser **atômicas** (`findOneAndUpdate` com filtro de versão ou transação) para respeitar RN-FIC-02.

**`leads`**
```json
{ "_id": "ObjectId", "name": "…", "phone": "…", "email": "…", "profile": "…", "workplace": "…",
  "username": "agata", "consentAt": "ISODate", "createdAt": "ISODate" }
```
Índice `createdAt` desc. **Sem senha.**

---

## 11. Regras de negócio mapeadas durante o desenvolvimento

Instrução obrigatória ao Claude Code:

1. Crie `docs/business-rules.md` **no início** copiando o catálogo da seção 5 (IDs `RN-*`) em formato de tabela: `ID | Regra | Onde é aplicada (arquivo/classe) | Teste que cobre`.
2. A cada caso de uso/entidade implementado, **preencha as colunas "Onde"/"Teste"** na mesma tarefa. Nenhuma RN pode ficar sem teste.
3. Nomeie testes com o ID: `it('RN-FIC-06: soma diferente do total escrito retorna 422 com a mensagem do protótipo')`.
4. Cada vez que uma regra nova surgir (ou for ajustada), **acrescente uma linha** com novo ID e descreva a decisão.
5. O domínio puro (`SuggestionEngine`, `TrendCalculator`, `MagicOzFichaExtractor`, `uniqueDate`, `firstNameUsername`) tem **testes unitários com os cenários da seção 6.3** (tabela de aceitação).
6. Documente também as decisões de design em `docs/adr/` (curtas).

Mapa rápido RN → onde viver na arquitetura:

| Regras | Camada |
|---|---|
| RN-AUTH-*, RN-LEAD-* | `identity/domain` (`UserName`, `Password` VOs, `TrialAccessService`) + casos de uso `Login`, `Signup`, `RequestTrialAccess` |
| RN-PAT-* | `patients/domain` (`Patient`, VOs `Initials`, `Age`, `Phone`, enums) + `CreatePatient`, `UpdatePatient`, `DeletePatient`, `ListPatients`, `GetPatient` |
| RN-FIC-* | `patients/domain` (`Evaluation`, `PendingFicha`) + `evaluations/application` (`UploadFicha`, `GetPendingFicha`, `ConfirmPendingFicha`, `ListFichas`) |
| RN-EVO-* e biblioteca | `care-planning/domain` (puro, sem I/O) + `GetEvolution`, `UpdateSuggestionState` |
| Visibilidade (RN-PAT-01) | política `PatientAccessPolicy` no domínio, usada por todos os casos de uso |
| KPIs/"Para fazer hoje"/Rotinas | `dashboard/application` (queries, sem alterar agregados) |

---

## 12. Plano de execução em fases (cada fase termina com testes verdes)

1. **Setup:** monorepo, TypeScript estrito, ESLint/Prettier, Vitest, Docker Compose (Mongo), `packages/shared` (enums, domínios, constantes de texto), copiar o CSS e a logo.
2. **Domínio puro + testes:** `care-planning` (flags, sugestões, tendência, biblioteca), `MagicOzFichaExtractor`, `uniqueDate`, geração de código sequencial, normalização de usuário. Cobrir **todos** os cenários da seção 6.3.
3. **API:** repositórios Mongo, casos de uso, rotas, Zod, JWT, `PatientAccessPolicy`, tratamento de erros com as mensagens do protótipo. Testes de integração (Supertest + `mongodb-memory-server`) por endpoint (seção 9).
4. **Seed + `/demo/reset`.**
5. **Front:** layout global, rotas protegidas, telas na ordem: Auth → Pacientes/Form → Paciente (Fichas com revisão → Evolução/Sugestões → Dados) → Início → Rotinas → Usuários → pop-up. TanStack Query para dados; Zustand para estado de UI (7.8). Reproduzir temporizações (1,1 s e 3×650 ms).
6. **Paridade:** abrir `mente-ativa-prototipo.html` e o app lado a lado; percorrer o **roteiro de aceitação** abaixo; corrigir diferenças visuais/textuais. E2E (Playwright) cobrindo o roteiro.
7. **Hardening mínimo:** rate limit em `/auth/*`, CORS, helmet, logs, variáveis de ambiente.

### Roteiro de aceitação (E2E) — deve passar igual ao protótipo

1. Abrir `/` sem sessão → vai para `/login`. `admin/admin` → Início como "Administrador" com os KPIs da seção 6.3.
2. Login com senha errada → "Usuário ou senha incorretos."
3. Pacientes (admin) → vê 014, 021, 009 com "Responsável: …". Sair; entrar como `prof1/prof1` → vê só 014 e 009; `/usuarios` não aparece no menu.
4. Paciente 014 → Enviar nova ficha → 1,1 s → ficha na tela → Extrair (3 passos) → campo "Atenção e cálculo" sinalizado → botão Confirmar **desabilitado** até clicar **Está correto** e a soma conferir → alterar um valor quebra a soma (mensagem warn) e desabilita → corrigir → Confirmar → cai em Evolução com a tendência/sugestões esperadas (6.3).
5. Aceitar 1 sugestão, editar o texto de outra, recusar a terceira, Desfazer → Rotinas mostra só a aceita (com o texto original) e a contagem em Início = 1.
6. Novo paciente: validar cada mensagem de RN-PAT-04; salvar → abre em Fichas ("Nenhuma ficha enviada ainda."); 1º envio gera `{9,3,4,2,8}`; confirmar → "Linha de base".
7. Editar dados (responsável não editável); Excluir com confirmação em 2 passos → some da lista.
8. Sair → "Quero testar": validar mensagens; enviar com "Ágata Souza / (32) 9 1234-5678 / agata@exemplo.com" → entra direto, Início vazio de pacientes, **pop-up** com `agata` / `5678`; Esc fecha. Sair e logar com `agata/5678` funciona. Repetir com "Agata Lima" → `agata2`.
9. Admin → Usuários mostra a tabela e o pedido de teste da Ágata.
10. Redimensionar para < 820px: menu vira barra horizontal; < 760px: ficha e extração em 1 coluna. Tema escuro segue o sistema.

---

## 13. Desvios permitidos (única exceção à paridade)

1. **Persistência:** dados e usuários criados passam a persistir (antes sumiam ao recarregar). Para demos, `POST /demo/reset`.
2. **Sessão:** manter o token (cookie httpOnly ou storage) para não pedir login a cada recarga é aceitável.
3. **Senhas** com hash; **rate limit/bloqueio** em `/auth/*`. Atenção: a regra "senha = 4 últimos dígitos do telefone" (RN-LEAD-03) é **fraca por natureza** — mantida por exigência do produto para contas de teste; marque essas contas com `origin: "trial"` para permitir expiração/limpeza futura.
4. **Validação no servidor** das regras de ficha (RN-FIC-08) — o cliente já bloqueava na UI.
5. **Observações da ficha** podem ser persistidas (invisíveis).
6. Estados de sugestão (aceito/recusado/texto) passam a persistir por paciente.

Qualquer outra mudança visível (textos, cores, ordem, fluxo, novas telas, busca, filtros) **está fora do escopo** — registrar como sugestão futura em `docs/backlog.md`, não implementar.

---

## 14. Fora do escopo desta migração (backlog)

Extração real por IA/OCR e upload de arquivo; outros instrumentos de avaliação; biblioteca de atividades editável; agenda semanal; relatório imprimível; alertas; busca/filtros; admin editar/remover usuários e reatribuir paciente; recuperação de senha; LGPD completa (termo de consentimento versionado, log de acesso, exclusão definitiva auditada).