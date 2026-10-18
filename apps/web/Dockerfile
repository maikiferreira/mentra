# Dependências de todo o monorepo (base dos estágios de desenvolvimento e build).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# Desenvolvimento (docker-compose.yml): Vite com recarga automática.
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@mente-ativa/web"]

# Gera os arquivos estáticos. Por padrão a API fica no mesmo endereço, em /api/v1.
FROM deps AS build
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN npm run build --workspace @mente-ativa/web

# Produção: nginx servindo o front e repassando /api para o serviço da API.
FROM nginx:1.27-alpine AS prod
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
