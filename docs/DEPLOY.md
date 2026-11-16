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
