# Metro em modo de produção, para o Expo Go baixar o app pela internet
# (serviço `expo` do docker-compose.yml, atrás do Nginx de expo-naoenao.obrian.me).
# Contexto do build: a raiz do repositório.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY mobile/package.json mobile/
RUN npm ci -w mobile -w shared --include-workspace-root
COPY shared shared
COPY mobile mobile
# O Metro grava o cache em /tmp e o Expo grava .expo/ e expo-env.d.ts em mobile/.
RUN chown -R node:node /app/mobile
USER node
ENV PORT=8081 CI=1 EXPO_NO_TELEMETRY=1 NODE_OPTIONS=--max-old-space-size=768
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8081/',{headers:{'expo-platform':'android',accept:'multipart/mixed,application/expo+json'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "mobile/scripts/serve-public.mjs"]
