# ADR 0001 — Monorepo npm e tooling compartilhado

- **Status:** aceito.
- **Decisão:** usar npm workspaces para `apps/web`, `apps/api` e `packages/shared`; TypeScript estrito, ESLint, Prettier e Vitest no repositório.
- **Motivo:** manter dependências e comandos reproduzíveis para a migração sem acrescentar outro gerenciador de pacotes.
- **Consequência:** builds e verificações podem ser executados por workspace; regras do produto permanecem para fases posteriores.
