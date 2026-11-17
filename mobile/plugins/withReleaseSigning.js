// Assina o APK release com a chave da Mariana, sem a chave entrar no git.
// O android/ é gerado pelo `expo prebuild` (fora do git); este plugin põe no
// app/build.gradle uma assinatura "release" lida de um arquivo .properties
// apontado por MARIANA_KEYSTORE_PROPERTIES (storeFile, storePassword,
// keyAlias, keyPassword). Sem a variável, o release fica com a chave de
// depuração, como no modelo do Expo. Ver docs/NOTIFICACOES.md.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// mariana: assinatura release';

const SIGNING = `
        ${MARK}
        release {
            def propsPath = System.getenv('MARIANA_KEYSTORE_PROPERTIES')
            if (propsPath) {
                def props = new Properties()
                new File(propsPath).withInputStream { props.load(it) }
                storeFile new File(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    const debugBlock = /signingConfigs \{\s*debug \{[^}]*\}/;
    if (!debugBlock.test(src)) throw new Error('withReleaseSigning: bloco signingConfigs.debug não encontrado no app/build.gradle');
    src = src.replace(debugBlock, (m) => `${m}${SIGNING}`);
    const releaseUse = /(release \{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/;
    if (!releaseUse.test(src)) throw new Error('withReleaseSigning: signingConfig do release não encontrado no app/build.gradle');
    src = src.replace(releaseUse, `$1signingConfig System.getenv('MARIANA_KEYSTORE_PROPERTIES') ? signingConfigs.release : signingConfigs.debug`);
    cfg.modResults.contents = src;
    return cfg;
  });
};
