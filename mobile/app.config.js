// O app.json com uma coisa a mais: o google-services.json do Firebase, que fica
// fora do repositório (no PC, em D:\segredos\mariana). O build aponta para ele
// por MARIANA_GOOGLE_SERVICES_FILE, sem copiar para a pasta do projeto; o
// prebuild o põe em android/app/, que também fica fora do git.
// Sem a variável, o APK sai igual, com o push desligado e o alarme só pelo
// toque local. Ver docs/NOTIFICACOES.md.
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => {
  const file = process.env.MARIANA_GOOGLE_SERVICES_FILE;
  if (file && !existsSync(file)) throw new Error(`MARIANA_GOOGLE_SERVICES_FILE aponta para um arquivo que não existe: ${file}`);
  return {
    ...config,
    android: {
      ...config.android,
      ...(file ? { googleServicesFile: resolve(file) } : {}),
    },
  };
};
