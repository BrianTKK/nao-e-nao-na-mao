#!/usr/bin/env bash
# Gera o APK release da Mariana no PC, com as ferramentas no D: (o C: tem pouco espaço).
# Uso (Git Bash): bash mobile/scripts/build-apk.sh
#
# - Ferramentas: JDK 17 em $TOOLS/jdk-17, Android SDK em $TOOLS/sdk, cache do
#   Gradle em $TOOLS/gradle. Padrão TOOLS=/d/Android.
# - Segredos, fora do repositório e do cofre (padrão SECRETS=/d/segredos/mariana):
#   google-services.json (Firebase; sem ele, o APK sai sem push) e
#   mariana-release.properties (assinatura; sem ele, o APK sai com a chave de depuração).
# - Saída: $TOOLS/apk/mariana-<versão>-<commit>.apk
# Detalhes em docs/NOTIFICACOES.md.
set -euo pipefail

TOOLS="${MARIANA_TOOLS:-/d/Android}"
SECRETS="${MARIANA_SECRETS:-/d/segredos/mariana}"
export JAVA_HOME="$TOOLS/jdk-17"
export ANDROID_HOME="$TOOLS/sdk"
export GRADLE_USER_HOME="$TOOLS/gradle"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")/.."
[ -x "$JAVA_HOME/bin/java" ] || { echo "ERRO: JDK 17 não encontrado em $JAVA_HOME" >&2; exit 1; }
[ -d "$ANDROID_HOME/cmdline-tools/latest" ] || { echo "ERRO: Android SDK não encontrado em $ANDROID_HOME" >&2; exit 1; }

if [ -f "$SECRETS/google-services.json" ]; then
  cp "$SECRETS/google-services.json" google-services.json
  echo "Firebase: google-services.json incluído (push ligado)."
else
  rm -f google-services.json
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

(cd android && ./gradlew assembleRelease --no-daemon)

VERSION="$(node -p "require('./app.json').expo.version")"
REV="$(git rev-parse --short HEAD)"
OUT="$TOOLS/apk/mariana-$VERSION-$REV.apk"
mkdir -p "$TOOLS/apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner.bat" verify --print-certs "$OUT" | grep -E "Signer #1 certificate (DN|SHA-256)" || true
echo "APK: $OUT ($(du -h "$OUT" | cut -f1))"
