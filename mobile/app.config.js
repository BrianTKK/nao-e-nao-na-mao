// O app.json com uma coisa a mais: o google-services.json do Firebase entra no
// build só se existir. Ele fica fora do git (ver docs/NOTIFICACOES.md); sem ele,
// o APK sai igual, com o push desligado e o alarme só pelo toque local.
const { existsSync } = require('node:fs');
const { join } = require('node:path');

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(existsSync(join(__dirname, 'google-services.json')) ? { googleServicesFile: './google-services.json' } : {}),
  },
});
