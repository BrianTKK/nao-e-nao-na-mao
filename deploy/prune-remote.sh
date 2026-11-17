#!/usr/bin/env bash
# Roda na VPS, chamado pelo deploy.sh: apaga o que deploy/prune-plan.mjs listou
# (caminhos separados por \0 na entrada; pasta termina com "/").
# Confere de novo cada caminho: relativo, sem "..", e resolvido (seguindo links)
# dentro da pasta do deploy. Arquivo: rm -f. Pasta: rmdir, só se estiver vazia.
# Uso: bash deploy/prune-remote.sh <pasta-do-deploy> < plano
set -euo pipefail

cd -- "${1:?pasta do deploy}"
# Depois do cd, para a raiz e os caminhos saírem na mesma forma (no Git Bash do Windows, "C:/..." e "/c/..." diferem).
ROOT="$(realpath -- .)"

removed=0
while IFS= read -r -d '' p; do
  case "$p" in
    '' | /* | -* | ..* | */../* | */.. | *'/./'* | ./*)
      echo "RECUSADO: $p" >&2
      continue
      ;;
  esac
  target="${p%/}"
  resolved="$(realpath -m -- "$target")"
  case "$resolved" in
    "$ROOT"/*) ;;
    *)
      echo "RECUSADO (fora de $ROOT): $p" >&2
      continue
      ;;
  esac
  if [ "${p%/}" != "$p" ]; then
    # Pasta: só se existir, não for link e estiver vazia.
    if [ -d "$target" ] && [ ! -L "$target" ] && rmdir -- "$target" 2>/dev/null; then
      echo "apagada a pasta $target"
      removed=$((removed + 1))
    fi
  elif [ -e "$target" ] || [ -L "$target" ]; then
    if [ -d "$target" ] && [ ! -L "$target" ]; then
      echo "RECUSADO (é pasta): $p" >&2
      continue
    fi
    rm -f -- "$target"
    echo "apagado $target"
    removed=$((removed + 1))
  fi
done

echo "Limpeza: $removed item(ns) apagado(s)."
