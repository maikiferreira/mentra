# Mente Ativa

Plataforma para profissionais que fazem estimulação cognitiva com idosos. O profissional registra
os testes de rastreio de cada paciente, acompanha a evolução e monta uma rotina de atividades a
partir das sugestões do sistema.

> **A tecnologia sugere. O profissional decide.** Os testes são instrumentos de rastreio e as
> sugestões não são diagnóstico nem prescrição.

## O que a aplicação faz

- **Fichas de 9 testes de rastreio**, organizadas por área:
  - Cognição: MEEM, MoCA, Teste do Relógio, Fluência verbal;
  - Humor: GDS-15, Inventário de Ansiedade Geriátrica;
  - Funcionalidade: Pfeffer, Katz, CDR.
- **Pontuação e interpretação** pelas notas de corte do e-book de referência, incluindo as que
  dependem da escolaridade.
- **Fichas editáveis:** consulta item a item, edição e exclusão, com a evolução recalculada.
- **Evolução por teste:** gráfico, comparação com a ficha anterior e tendência.
- **Visão geral do paciente:** as três áreas lado a lado, alertas que cruzam os resultados e agenda
  de reavaliação.
- **Sugestões de rotina** por teste, que o profissional aceita, edita ou recusa.
- **Acompanhamento da rotina:** marcação semanal, adesão e versão para imprimir.
- **Relatório do paciente**, para imprimir ou salvar em PDF.

## Tecnologias

| Parte             | Tecnologias                                                           |
| ----------------- | --------------------------------------------------------------------- |
| `apps/web`        | React 18, React Router, TanStack Query, Zustand, Vite                 |
| `apps/api`        | Node.js 20, Express 5, Mongoose (MongoDB 7), Zod, JWT                 |
| `packages/shared` | Regras dos testes, sugestões, visão geral e contrato da API           |
| Testes            | Vitest, Testing Library, Supertest, mongodb-memory-server, Playwright |

O projeto é um monorepo com npm workspaces ([ADR 0001](docs/adr/0001-monorepo-e-tooling.md)).

```
apps/
  api/          API REST (src/modules/<domínio>/{application,domain,presentation})
  web/          Front (src/pages, src/components, src/lib)
packages/
  shared/       Catálogo de testes (instruments.ts), visão geral, rotina e contratos da API
e2e/            Testes de ponta a ponta (Playwright)
docs/           Regras de negócio, ADRs e protótipo original
```

## Como rodar localmente

Requisitos: **Node.js 20+** e **MongoDB 7** rodando em `localhost:27017` (ou use o Docker, abaixo).

```bash
npm ci
cp .env.example .env                       # ajuste se necessário
npm run seed --workspace @mente-ativa/api  # usuários e pacientes de exemplo
npm run dev                                # API (localhost:3000) e front (localhost:5173) juntos
```

Usuários de exemplo: `admin` / `admin`, `prof1` / `prof1` e `prof2` / `prof2`. Os pacientes de
exemplo já têm fichas dos nove testes. O seed só insere o que falta e não altera dados existentes.

> Se a tela ficar em branco depois de trocar de branch com o servidor rodando, reinicie o
> `npm run dev` do front: o Vite pode guardar uma versão antiga dos arquivos.

### Com Docker (desenvolvimento)

```bash
docker compose up --build
```

Sobe MongoDB, API e front com recarga automática, nas mesmas portas acima.

## Testes e verificações

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # TypeScript em todos os workspaces
npm test               # unitários, interface e integração da API (MongoDB em memória)
npm run test:e2e       # Playwright: precisa de API e front rodando e do Google Chrome
```

Os testes E2E restauram os dados de exemplo (`POST /api/v1/demo/reset`). Para não apagar o seu banco
de desenvolvimento, rode-os contra uma API apontada para outro banco:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/mente-ativa-e2e npm run seed --workspace @mente-ativa/api
PORT=3100 MONGO_URI=mongodb://127.0.0.1:27017/mente-ativa-e2e WEB_ORIGINS=http://127.0.0.1:5180 \
  npm run dev --workspace @mente-ativa/api
(cd apps/web && VITE_API_URL=http://127.0.0.1:3100/api/v1 npx vite --host 127.0.0.1 --port 5180)
E2E_BASE_URL=http://127.0.0.1:5180 E2E_API_URL=http://127.0.0.1:3100/api/v1 npm run test:e2e
```

O GitHub Actions ([ci.yml](.github/workflows/ci.yml)) roda todas as verificações, o build de
produção e os testes E2E a cada push na `main` e em cada pull request.

## Produção

Em produção (`NODE_ENV=production`) a API exige `JWT_SECRET` com 32 caracteres ou mais, desativa a
restauração de dados de exemplo (`/demo/reset`) e bloqueia o seed de demonstração. Crie o primeiro
administrador com:

```bash
ADMIN_PASSWORD='senha-com-12-ou-mais' npm run create-admin -w @mente-ativa/api -- <usuario> "<Nome>"
```

### Render (deploy atual)

O [render.yaml](render.yaml) publica a `main` automaticamente:

- **API:** roda direto do TypeScript (`npm start`, com `tsx`).
- **Front:** é publicado como site estático.

Configure `MONGO_URI` e `JWT_SECRET` no painel do Render.

### Docker

```bash
JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
  docker compose -f docker-compose.prod.yml up -d --build
```

- **API:** roda o JavaScript compilado, sem dependências de desenvolvimento e sem root.
- **Front:** é servido pelo nginx, que também repassa `/api` para a API (mesmo endereço, sem CORS),
  em `http://localhost:8080` (porta configurável por `WEB_PORT`).

Sem Docker, o build compilado é:

```bash
npm run build --workspace @mente-ativa/shared
npm run build --workspace @mente-ativa/api   # depois: npm run start:dist -w @mente-ativa/api
npm run build --workspace @mente-ativa/web   # arquivos estáticos em apps/web/dist
```

O pacote `@mente-ativa/shared` é lido direto do TypeScript pela condição de importação `source`. Isso
vale em desenvolvimento, nos testes e no `npm start` usado pelo Render. Já o `start:dist` e o Docker
usam o JavaScript compilado (`packages/shared/dist`).

### Variáveis de ambiente

| Variável         | Onde | Descrição                                                               |
| ---------------- | ---- | ----------------------------------------------------------------------- |
| `MONGO_URI`      | API  | Conexão com o MongoDB (padrão `mongodb://127.0.0.1:27017/mente-ativa`)  |
| `JWT_SECRET`     | API  | Segredo dos tokens. **Obrigatório em produção, com 32+ caracteres**     |
| `PORT`           | API  | Porta HTTP (o Render define); `API_PORT` é a alternativa local (`3000`) |
| `NODE_ENV`       | API  | `production` ativa as proteções descritas acima                         |
| `LOG_LEVEL`      | API  | Nível de log do pino (`info` por padrão)                                |
| `WEB_ORIGINS`    | API  | Origens liberadas no CORS, separadas por vírgula                        |
| `ADMIN_PASSWORD` | API  | Usada só pelo `create-admin` (mínimo 12 caracteres)                     |
| `VITE_API_URL`   | Web  | Endereço da API usado pelo front (no Docker de produção: `/api/v1`)     |

## Documentação

- [Regras de negócio](docs/business-rules.md): cada regra com o código e o teste que a cobrem.
- [Protótipo original](docs/prototipo/): referência visual da primeira versão.

## Antes de usar com pacientes reais

- **Dados sensíveis:** o sistema guarda dados de saúde, que a LGPD trata como sensíveis. Revise
  consentimento, registro de acessos, retenção e exclusão de dados, além da hospedagem.
- **Usuários e senhas:** não use os usuários de exemplo em produção. Crie os acessos com o
  `create-admin`.
- **Licença dos testes:** o **MoCA** exige licença e certificação para uso; confirme os direitos de
  uso de cada teste antes de oferecer o produto comercialmente.
- **Revisão profissional:** os textos das sugestões de atividades devem ser revisados por um
  profissional da área.
