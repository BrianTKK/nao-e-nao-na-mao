#!/usr/bin/env bash
# Gera o APK release da Mariana no PC, com as ferramentas no D: (o C: tem pouco espaço).
# Uso (Git Bash): bash mobile/scripts/build-apk.sh
#
# - Ferramentas: JDK 17 em $TOOLS/jdk-17, Android SDK em $TOOLS/sdk, cache do
#   Gradle em $TOOLS/gradle. Padrão TOOLS=/d/Android.
# - Segredos, fora do repositório e do cofre (padrão SECRETS=/d/segredos/mariana):
#   google-services.json (Firebase; sem ele, ou com MARIANA_SEM_FIREBASE=1, o APK sai sem push) e
#   mariana-release.properties (assinatura; sem ele, o APK sai com a chave de depuração).
# - Saída: $TOOLS/apk/mariana-<versão>-<commit>.apk
# - Para o PC seguir usável durante o build: MARIANA_NICE=1 roda o Gradle e o que ele abre em
#   prioridade baixa, e MARIANA_MAX_WORKERS=2 limita os processos do Gradle. Fica mais lento.
# Detalhes em docs/NOTIFICACOES.md.
set -euo pipefail

TOOLS="${MARIANA_TOOLS:-/d/Android}"
SECRETS="${MARIANA_SECRETS:-/d/segredos/mariana}"
export JAVA_HOME="$TOOLS/jdk-17"
export ANDROID_HOME="$TOOLS/sdk"
export GRADLE_USER_HOME="$TOOLS/gradle"
# Build nativo num caminho curto (o ninja do Windows não passa de 260 caracteres; ver plugins/withShortObjectPaths.js).
export MARIANA_CXX_DIR="$(cygpath -m "$TOOLS/cxx" 2>/dev/null || echo "$TOOLS/cxx")"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")/.."
[ -x "$JAVA_HOME/bin/java" ] || { echo "ERRO: JDK 17 não encontrado em $JAVA_HOME" >&2; exit 1; }
[ -d "$ANDROID_HOME/cmdline-tools/latest" ] || { echo "ERRO: Android SDK não encontrado em $ANDROID_HOME" >&2; exit 1; }

# O google-services.json fica onde está (fora do repositório): o app.config.js lê o caminho.
if [ -f "$SECRETS/google-services.json" ] && [ "${MARIANA_SEM_FIREBASE:-0}" != "1" ]; then
  MARIANA_GOOGLE_SERVICES_FILE="$(cygpath -m "$SECRETS/google-services.json" 2>/dev/null || echo "$SECRETS/google-services.json")"
  export MARIANA_GOOGLE_SERVICES_FILE
  echo "Firebase: google-services.json de $SECRETS (push ligado)."
else
  unset MARIANA_GOOGLE_SERVICES_FILE
  echo "Firebase: sem google-services.json; o APK sai sem push (alarme só pelo toque local)."
fi

if [ -f "$SECRETS/mariana-release.properties" ]; then
  MARIANA_KEYSTORE_PROPERTIES="$(cygpath -m "$SECRETS/mariana-release.properties" 2>/dev/null || echo "$SECRETS/mariana-release.properties")"
  export MARIANA_KEYSTORE_PROPERTIES
  echo "Assinatura: chave release da Mariana."
else
  echo "Assinatura: sem mariana-release.properties; o release sai com a chave de depuração."
fi

# O prebuild reescreve os scripts do package.json; o do repositório volta igual depois.
# (Não usar TMP como nome: no Windows ele é a pasta temporária do Java e do Kotlin.)
SAVED="$(mktemp -d)"
trap 'cp "$SAVED/package.json" package.json; rm -rf "$SAVED"' EXIT
cp package.json "$SAVED/package.json"
npx expo prebuild --platform android --no-install --clean
cp "$SAVED/package.json" package.json

# Só ARM (os celulares de verdade); x86 e x86_64 são de emulador e quase dobram o APK.
ARCHS="${MARIANA_ARCHS:-armeabi-v7a,arm64-v8a}"
GRADLE_ARGS=(assembleRelease --no-daemon -PreactNativeArchitectures="$ARCHS")
[ -n "${MARIANA_MAX_WORKERS:-}" ] && GRADLE_ARGS+=("--max-workers=$MARIANA_MAX_WORKERS")
if [ "${MARIANA_NICE:-0}" = "1" ]; then
  # No Windows, a prioridade baixa passa para os processos que o Gradle abre (Java, Kotlin, ninja, clang).
  (cd android && nice -n 19 ./gradlew "${GRADLE_ARGS[@]}")
else
  (cd android && ./gradlew "${GRADLE_ARGS[@]}")
fi

VERSION="$(node -p "require('./app.json').expo.version")"
REV="$(git rev-parse --short HEAD)"
OUT="$TOOLS/apk/mariana-$VERSION-$REV.apk"
mkdir -p "$TOOLS/apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner.bat" verify --print-certs "$OUT" | grep -E "certificate (DN|SHA-256)" || true
echo "APK: $OUT ($(du -h "$OUT" | cut -f1))"

# O C: tem pouco espaço: o build deixa ~7 GB nele (android/ e as pastas android/build e
# .cxx das bibliotecas em node_modules). Tudo isso se recria no próximo build, que fica mais
# lento (o nativo compila de novo). MARIANA_KEEP_BUILD=1 mantém.
if [ "${MARIANA_KEEP_BUILD:-0}" != "1" ]; then
  find ../node_modules node_modules -maxdepth 4 -type d \( -path "*/android/build" -o -path "*/android/.cxx" \) -prune -exec rm -rf {} + 2>/dev/null || true
  rm -rf android
  echo "Limpeza: saída do build apagada do C: (MARIANA_KEEP_BUILD=1 mantém)."
fi
