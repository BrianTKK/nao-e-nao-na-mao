# Imagem do servidor: API + WebSocket + web compilada, na mesma origem.
# O app mobile não entra aqui (ele roda no Expo Go e aponta para esta URL).

FROM node:24-slim AS build
WORKDIR /app
# Só os package.json primeiro, para o cache das dependências.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY mobile/package.json mobile/
RUN npm ci -w shared -w server -w web --include-workspace-root --ignore-scripts
COPY shared shared
COPY server server
COPY web web
COPY db db
# A web em produção fala com o servidor na mesma origem.
# SHOW_DEMO=0 esconde o botão "preencher com a conta de teste" do painel.
ARG SHOW_DEMO=1
RUN VITE_DATA_SOURCE=api VITE_SHOW_DEMO=$SHOW_DEMO npm run build -w web && npm run build -w server

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY mobile/package.json mobile/
COPY shared shared
RUN npm ci -w server --omit=dev --ignore-scripts

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/shared shared
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/db db
COPY package.json ./
# Sem root dentro do contêiner.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
