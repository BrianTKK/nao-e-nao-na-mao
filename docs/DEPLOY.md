# Deploy na VPS

O projeto `naoenao` roda no Docker Compose, com dois contêineres:

- `app`: o servidor Node com a API, o WebSocket e a web compilada, em `127.0.0.1:APP_PORT`;
- `db`: o Postgres 17, sem porta publicada, com volume.

O Nginx fica na frente, com HTTPS e o upgrade de WebSocket.

## Primeira vez

1. **DNS**: registro A `naoenao` apontando para o IP da VPS.
2. **Pasta e `.env`**:
   ```bash
   mkdir -p /var/www/naoenao && cd /var/www/naoenao
   # copie deploy/.env.example para .env e preencha:
   # APP_PORT (a próxima porta livre, conferida com: ss -tlnp | grep 127.0.0.1)
   # POSTGRES_PASSWORD e JWT_SECRET (aleatórios, 32+ caracteres)
   chmod 600 .env
   ```
3. **Código e contêineres** (do PC, na raiz do repositório):
   ```bash
   DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
   ```
   O script envia os arquivos versionados, roda `docker compose up -d --build app` e confere `/api/health`. No primeiro início, o servidor aplica as migrações e, com `SEED_DEMO=1`, cria o bar de demonstração.
4. **Nginx**:
   ```bash
   cp deploy/nginx-naoenao.obrian.me.conf /etc/nginx/sites-available/naoenao.obrian.me
   sed -i 's/127.0.0.1:3070/127.0.0.1:<APP_PORT>/' /etc/nginx/sites-available/naoenao.obrian.me
   ln -s /etc/nginx/sites-available/naoenao.obrian.me /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d naoenao.obrian.me
   ```
5. **Reinício diário do bar de demonstração**:
   ```bash
   cp deploy/cron-naoenao-demo /etc/cron.d/naoenao-demo
   ```
6. **Conferir**:
   - `curl -s https://naoenao.obrian.me/api/health` deve responder `{"ok":true,"db":"postgres"}`;
   - `https://naoenao.obrian.me/q/ESQBF7K2` deve abrir a página do QR;
   - `https://naoenao.obrian.me/painel` deve abrir o painel.

## App no celular: Expo Go público (expo-naoenao.obrian.me)

O serviço `expo` do compose roda o Metro em modo de produção (`--no-dev --minify`, 2 workers). O Expo Go de qualquer celular abre `exps://expo-naoenao.obrian.me`, e o QR fica em https://naoenao.obrian.me/testar. Assim o teste não depende do PC nem do celular de ninguém.

1. **DNS**: registro A `expo-naoenao` apontando para o IP da VPS.
2. **`.env`**: `EXPO_PORT` (sugestão 3071; conferir a livre com `ss -tlnp | grep 127.0.0.1`).
3. **Subir** (do PC):
   ```bash
   DEPLOY_SERVICES="app expo" DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
   ```
   A imagem do `expo` é `deploy/expo.Dockerfile`, com o ignore próprio `deploy/expo.Dockerfile.dockerignore`. Quando sobe, o script `mobile/scripts/serve-public.mjs` monta e aquece os bundles de Android e iOS (cerca de 30 s cada no PC), e o log mostra `[serve-public] bundle android pronto`.
4. **Nginx** (o Metro é um servidor de desenvolvimento, então só passa o necessário):
   ```bash
   cp deploy/nginx-snippet-naoenao-expo-proxy.conf /etc/nginx/snippets/naoenao-expo-proxy.conf
   cp deploy/nginx-expo-naoenao.obrian.me.conf /etc/nginx/sites-available/expo-naoenao.obrian.me
   sed -i 's/127.0.0.1:3071/127.0.0.1:<EXPO_PORT>/' /etc/nginx/sites-available/expo-naoenao.obrian.me
   ln -s /etc/nginx/sites-available/expo-naoenao.obrian.me /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d expo-naoenao.obrian.me
   ```
   - **Liberado**, só GET e HEAD: o manifesto em `/`, os `*.bundle`, `/assets/` e `/_expo/`.
   - **Bloqueado** com 403: o upgrade de WebSocket e as ferramentas do Metro (`/debugger-ui`, `/json`, `/inspector`, `/message`, `/events`, `/open-stack-frame`, `/open-url`, `/symbolicate`, `/reload`, `/hot`, `/status`, `/logs`).
   - **O resto**: 404.
5. **Conferir**:
   ```bash
   curl -s -o /dev/null -w "%{http_code} %{content_type}
" -H "expo-platform: android" -H "accept: multipart/mixed,application/expo+json" https://expo-naoenao.obrian.me/
   ```
   A resposta esperada é `200 multipart/mixed`. Depois disso, `https://expo-naoenao.obrian.me/json/list` deve responder 403. Por fim, leia o QR de `/testar` com o Expo Go (SDK 58).

**Memória**: no PC (Windows), o Metro com 2 workers e `--max-old-space-size=768` chegou a 1,3 GB de pico na primeira montagem dos dois bundles. Sem limite de workers, chegou a 2,1 GB. O compose usa `mem_limit: 1536m`. Depois de montados os bundles, o Metro parado ficou perto de 300 MB.

**Atualizar o app**: a cada mudança no `mobile/` ou no `shared/`, rode `DEPLOY_SERVICES=expo ./deploy.sh`. O Metro está com `CI=1`, sem recarregar sozinho.

## Atualizar

```bash
DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
```

As migrações novas (`db/migrations/*.sql`) rodam sozinhas quando o contêiner sobe.

## Variáveis do `.env` do servidor

| Variável | Para quê |
| --- | --- |
| `APP_PORT` | Porta local do app; o Nginx aponta para ela |
| `POSTGRES_PASSWORD` | Senha do Postgres do compose |
| `JWT_SECRET` | Segredo dos tokens de login (32+ caracteres). O servidor não sobe sem ele em produção |
| `SESSION_HOURS` | Validade do login da equipe (padrão 16) |
| `SEED_DEMO` | `1` cria o bar de demonstração no primeiro início |
| `CORS_ORIGINS` | Normalmente vazio |
| `EXPO_PORT` | Porta local do Metro (serviço `expo`); o Nginx de `expo-naoenao` aponta para ela |
| `SHOW_DEMO` | `1` mostra o botão "preencher com a conta de teste" no painel e no app (a senha aparece na tela); `0` esconde. Mudar exige rebuild de `app` e `expo` |

O `DATABASE_URL` e o `TRUST_PROXY=1` já estão no `docker-compose.yml`.

## Bar de demonstração

O bar "Bar Esquina da Vila" e as contas de `db/test-users.json` existem para a avaliação.

- As contas são da equipe e da gerência **só desse bar**. Nenhuma conta tem poder sobre outro bar, e não existe conta de administrador.
- O cron volta esse bar ao seed todo dia às 06:00 de Brasília: apaga o histórico, os locais criados no teste e as mudanças na equipe.
- Para restaurar na hora:
  ```bash
  cd /var/www/naoenao && docker compose exec -T app node server/dist/cli.js demo:reset
  ```

## O que não foi testado antes do primeiro deploy

O PC de desenvolvimento não tem Docker. Foi testado:

- a montagem que o Dockerfile faz, numa cópia limpa: as dependências sem as de desenvolvimento, o servidor empacotado e a web compilada;
- essa montagem subindo, servindo `/q/<código>` e criando um pedido, com o Postgres embutido.

Ficou de fora:

- a imagem Linux em si;
- o servidor com o Postgres 17 de verdade (`DATABASE_URL`);
- o Nginx com o WebSocket.
