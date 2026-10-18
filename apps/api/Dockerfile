# Dependências de todo o monorepo (base dos estágios de desenvolvimento e build).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# Desenvolvimento (docker-compose.yml): código montado por volume e recarga automática.
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@mente-ativa/api"]

# Compila o pacote compartilhado e a API para JavaScript.
FROM deps AS build
COPY . .
RUN npm run build --workspace @mente-ativa/shared && npm run build --workspace @mente-ativa/api

# Produção: só dependências de execução e código compilado, sem root.
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace @mente-ativa/api && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
