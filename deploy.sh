#!/usr/bin/env bash
# Publica o projeto na VPS e reconstrói o contêiner do app.
# Uso: DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
#      DEPLOY_SERVICES="app expo" DEPLOY_HOST=... ./deploy.sh   (também o Metro do Expo Go)
# Envia os arquivos versionados e os novos não ignorados (o .env local nunca vai);
# o .env do servidor não é tocado.
set -euo pipefail

HOST="${DEPLOY_HOST:?Defina DEPLOY_HOST, por exemplo DEPLOY_HOST=root@1.2.3.4}"
DIR="${DEPLOY_DIR:-/var/www/naoenao}"
SERVICES="${DEPLOY_SERVICES:-app}"

cd "$(dirname "$0")"

PORT="$(ssh "$HOST" "grep -E '^APP_PORT=' $DIR/.env | cut -d= -f2" 2>/dev/null || true)"
if [ -z "$PORT" ]; then
  echo "ERRO: $HOST:$DIR/.env não existe ou não tem APP_PORT (modelo em deploy/.env.example)" >&2
  exit 1
fi

echo "Publicando $(git rev-parse --short HEAD) em $HOST:$DIR (porta $PORT)"
git ls-files -z -co --exclude-standard | tar --null -T - -cf - | ssh "$HOST" "mkdir -p $DIR && tar -xf - -C $DIR"
ssh "$HOST" "cd $DIR && echo $(git rev-parse --short HEAD) > REVISION && docker compose up -d --build $SERVICES && docker image prune -f >/dev/null"

for _ in $(seq 1 24); do
  if ssh "$HOST" "curl -fsS -o /dev/null http://127.0.0.1:$PORT/api/health"; then
    echo "OK: no ar"
    exit 0
  fi
  sleep 5
done

echo "ERRO: a aplicação não respondeu após o deploy" >&2
ssh "$HOST" "cd $DIR && docker compose logs --tail=40 app" >&2
exit 1
