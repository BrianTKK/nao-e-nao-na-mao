#!/usr/bin/env bash
# Publica o projeto na VPS e reconstrói o contêiner do app.
# Uso: DEPLOY_HOST=root@<ip-da-vps> ./deploy.sh
#      DEPLOY_SERVICES="app expo" DEPLOY_HOST=... ./deploy.sh   (também o Metro do Expo Go)
#      DEPLOY_DRY_RUN=1 DEPLOY_HOST=... ./deploy.sh             (ensaio: só mostra o que faria)
# Envia os arquivos versionados e os novos não ignorados (o .env local nunca vai);
# o .env do servidor não é tocado.
#
# Limpeza: a lista do que foi enviado fica em $DIR/.deployed-files. No deploy
# seguinte, o que estava nessa lista e saiu do repositório é apagado na VPS
# (deploy/prune-plan.mjs decide, deploy/prune-remote.sh apaga). O que o script
# nunca enviou (.env, REVISION, volumes, node_modules, dist, backups) não é
# tocado. Sem lista anterior, nada é apagado: só grava a lista.
set -euo pipefail

HOST="${DEPLOY_HOST:?Defina DEPLOY_HOST, por exemplo DEPLOY_HOST=root@1.2.3.4}"
DIR="${DEPLOY_DIR:-/var/www/naoenao}"
SERVICES="${DEPLOY_SERVICES:-app}"
DRY_RUN="${DEPLOY_DRY_RUN:-0}"

cd "$(dirname "$0")"
command -v node >/dev/null || { echo "ERRO: o deploy precisa do node neste computador (para calcular a limpeza)" >&2; exit 1; }

PORT="$(ssh "$HOST" "grep -E '^APP_PORT=' $DIR/.env | cut -d= -f2" 2>/dev/null || true)"
if [ -z "$PORT" ]; then
  echo "ERRO: $HOST:$DIR/.env não existe ou não tem APP_PORT (modelo em deploy/.env.example)" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REV="$(git rev-parse --short HEAD)"

# Lista deste deploy e a do anterior (se não existir, nada é apagado).
git ls-files -z -co --exclude-standard > "$TMP/new"
if ssh "$HOST" "cat $DIR/.deployed-files" > "$TMP/old" 2>/dev/null; then
  OLD="$TMP/old"
else
  OLD="--sem-lista"
fi
node deploy/prune-plan.mjs "$OLD" "$TMP/new" > "$TMP/plan"
TO_DELETE="$(tr -cd '\0' < "$TMP/plan" | wc -c | tr -d ' ')"

if [ "$DRY_RUN" = "1" ]; then
  echo "ENSAIO (DEPLOY_DRY_RUN=1): $REV em $HOST:$DIR (porta $PORT). Nada foi enviado, apagado nem reconstruído."
  node deploy/prune-plan.mjs --resumo "$OLD" "$TMP/new"
  echo "Serviços que seriam reconstruídos: $SERVICES"
  exit 0
fi

echo "Publicando $REV em $HOST:$DIR (porta $PORT); $TO_DELETE item(ns) a apagar"
tar --null -T "$TMP/new" -cf - | ssh "$HOST" "mkdir -p $DIR && tar -xf - -C $DIR"
if [ "$TO_DELETE" -gt 0 ]; then
  # O prune-remote.sh acabou de chegar com o tar.
  ssh "$HOST" "bash $DIR/deploy/prune-remote.sh $DIR" < "$TMP/plan"
fi
if [ "$OLD" = "--sem-lista" ]; then
  echo "Primeira lista de arquivos: nada foi apagado; a lista fica em $DIR/.deployed-files para o próximo deploy."
fi
ssh "$HOST" "cat > $DIR/.deployed-files.tmp && mv $DIR/.deployed-files.tmp $DIR/.deployed-files" < "$TMP/new"
ssh "$HOST" "cd $DIR && echo $REV > REVISION && docker compose up -d --build $SERVICES && docker image prune -f >/dev/null"

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
