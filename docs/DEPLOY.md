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

   **Site que já está no ar** (cardápio do local, 16/11): o Certbot já reescreveu o arquivo com o bloco 443, então não copie o arquivo de novo. Acrescente no bloco `server` da porta 443 o `location = /api/manager/menu/files { client_max_body_size 5m; ... }` de `deploy/nginx-naoenao.obrian.me.conf`, com a mesma `APP_PORT`, e rode `nginx -t && systemctl reload nginx`. Sem isso, o envio da foto do cardápio volta 413, porque o resto do site corta em 64 kB.
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

### Ensaio antes de publicar

```bash
DEPLOY_DRY_RUN=1 DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
```

Lê o `.env` e a lista do deploy anterior na VPS e mostra quantos arquivos iriam, quais são novos e o que seria apagado. Não envia, não apaga e não reconstrói nada.

### Limpeza do que saiu do repositório

O `tar` só acrescenta e substitui. Antes desta correção, um arquivo apagado no git ficava na VPS: o `MenuDisguise.tsx`, apagado no `324e6e9`, quebrou o `tsc -b` da web no deploy de 16/11.

- **A lista**: a cada deploy, a lista do que foi enviado (formato `git ls-files -z`) fica em `/var/www/naoenao/.deployed-files`.
- **O que é apagado**: o que estava na lista anterior e não está na nova. As pastas que ficarem vazias por isso também, mas só as que tinham arquivos enviados (`rmdir`, que não apaga pasta com conteúdo).
- **Quem decide e quem apaga**: `deploy/prune-plan.mjs` calcula no seu computador (por isso o deploy precisa do `node`); `deploy/prune-remote.sh` apaga na VPS.
- **O que nunca é apagado**:
    - o que o script não enviou: `.env`, `REVISION`, `.deployed-files`, volumes, `node_modules`, `dist` e backups. Nada disso está na lista, e mesmo numa lista adulterada esses nomes são recusados;
    - caminho absoluto, com `..` ou que, seguindo links, saia de `DEPLOY_DIR`. O `prune-remote.sh` confere de novo na VPS.
- **Sem lista anterior** (primeiro deploy com a correção): nada é apagado, só a lista é gravada.
- **Testes**: `npm run test:deploy` testa o plano (arquivo removido, lista ausente, `..`, absoluto, arquivo fora da lista, nomes protegidos) e roda o `prune-remote.sh` numa pasta temporária.

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
| `FCM_SERVICE_ACCOUNT_FILE` | Push remoto do alarme (app próprio no Android). Caminho, **dentro do contêiner**, do JSON da conta de serviço do Firebase: `/run/secrets/naoenao/fcm-service-account.json`. Sem ela, o push fica desligado e o log diz "Push remoto desligado" |
| `FCM_SECRETS_DIR` | Pasta da VPS montada só leitura em `/run/secrets/naoenao` (padrão `/etc/naoenao`) |

O `DATABASE_URL` e o `TRUST_PROXY=1` já estão no `docker-compose.yml`.

### Chave do Firebase (push remoto)

A chave da conta de serviço é uma credencial: **nunca no git, no cofre nem na pasta do deploy** (o `deploy.sh` envia a pasta inteira do repositório). No PC, ela fica em `D:\segredos\mariana\fcm-service-account.json`. Para ligar o push na VPS (passo da Central):

```bash
# do PC (Git Bash), uma vez:
ssh root@<ip-da-vps> 'getent group 10001 || groupadd -g 10001 naoenao-segredos; install -d -m 750 -o root -g 10001 /etc/naoenao'
scp /d/segredos/mariana/fcm-service-account.json root@<ip-da-vps>:/etc/naoenao/
ssh root@<ip-da-vps> 'chown root:10001 /etc/naoenao/fcm-service-account.json && chmod 640 /etc/naoenao/fcm-service-account.json'
# no .env da VPS:
#   FCM_SERVICE_ACCOUNT_FILE=/run/secrets/naoenao/fcm-service-account.json
DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
```

O grupo `10001` (`naoenao-segredos`) não tem ninguém na VPS: só o contêiner do app o recebe (`group_add` no `docker-compose.yml`), e o usuário `node` lê o arquivo por ele. Com o gid `1000` (o do `node`), qualquer usuário da VPS com esse gid também leria a chave. Se o `getent group 10001` mostrar um grupo que já existe e tem gente, escolher outro número e trocar nos dois lugares. No log do app deve aparecer `Push remoto ligado (FCM, projeto ...)`. O servidor nunca escreve a chave no log: se o arquivo estiver errado, ele diz só o motivo ("não é um JSON válido", nomes dos campos que faltam).

## APK para baixar

O app próprio para Android (push com o app fechado, ver `docs/NOTIFICACOES.md`) fica em **https://naoenao.obrian.me/download/mariana.apk**. A página `/testar` tem o botão "Baixar o app para Android". Publicado pela Central em 17/11/2026, com o ok do Brian ("Link na VPS").

- **Onde fica**: `/var/www/naoenao-files/`, fora da pasta do deploy. O `deploy.sh` não envia nem apaga nada ali. Hoje estão lá o `mariana-1.0.0-427bbe4.apk` (versionCode 2, visual Comanda, servido desde 17/11/2026) e o `mariana-1.0.0-31d70b9.apk` (versionCode 1, para voltar atrás).
- **Quem serve**: o Nginx, direto do disco, sem passar pelo app. O bloco vai no `server` da porta 443 (o modelo está em `deploy/nginx-naoenao.obrian.me.conf`):

  ```nginx
  location = /download/mariana.apk {
      alias /var/www/naoenao-files/mariana-1.0.0-427bbe4.apk;
      types { }
      default_type application/vnd.android.package-archive;
      add_header Content-Disposition 'attachment; filename="mariana.apk"' always;
      add_header Cache-Control 'no-cache' always;
  }
  ```

  O `no-cache` faz o navegador conferir a versão a cada download, então a troca do arquivo vale na hora.
- **Publicar uma versão nova** (o link não muda):
  1. No PC, gerar o APK com `bash mobile/scripts/build-apk.sh`, que grava em `D:\Android\apk\mariana-<versão>-<commit>.apk`. Antes, aumentar `expo.android.versionCode` no `mobile/app.json`: o Android só instala por cima com um código maior, e a assinatura tem de ser a mesma chave.
  2. Subir o arquivo para a mesma pasta, sem apagar o anterior, que serve para voltar atrás:

     ```bash
     scp /d/Android/apk/mariana-<versão>-<commit>.apk root@<ip-da-vps>:/var/www/naoenao-files/
     ```

  3. Na VPS, trocar o `alias` para o arquivo novo e rodar `nginx -t && systemctl reload nginx`.
  4. Conferir a soma: `sha256sum` do arquivo no PC e no download (`curl -s https://naoenao.obrian.me/download/mariana.apk | sha256sum`).

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
