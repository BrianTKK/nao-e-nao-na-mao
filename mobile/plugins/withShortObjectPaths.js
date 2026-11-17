// Build do APK no Windows: o ninja que vem com o CMake 3.22 do Android SDK não
// aceita caminho com mais de 260 caracteres, e o CMake põe o caminho inteiro da
// fonte no nome do arquivo de objeto (o RNGestureHandlerDetectorShadowNode do
// react-native-gesture-handler chegou a 354). Duas correções, sem mexer no
// registro do Windows (LongPathsEnabled), vistas em 17/11/2026:
// - CMAKE_OBJECT_PATH_MAX=250: o CMake troca por um hash o pedaço do caminho que
//   passar do limite (no Android ele não vem definido);
// - com MARIANA_CXX_DIR (o build-apk.sh põe D:\Android\cxx), a pasta do build
//   nativo sai de mobile/android/app/.cxx para um caminho curto, e o hash cabe com folga.
// Ver docs/NOTIFICACOES.md.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// mariana: caminhos curtos no build nativo (limite de 260 do ninja no Windows)';

module.exports = function withShortObjectPaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    if (!/^android \{\n/m.test(src) || !/^ {4}defaultConfig \{\n/m.test(src)) {
      throw new Error('withShortObjectPaths: bloco android ou defaultConfig não encontrado no app/build.gradle');
    }
    src = src.replace(
      /^android \{\n/m,
      (m) => `${m}    ${MARK}
    if (System.getenv('MARIANA_CXX_DIR')) {
        externalNativeBuild {
            cmake {
                buildStagingDirectory System.getenv('MARIANA_CXX_DIR')
            }
        }
    }
`,
    );
    src = src.replace(
      /^ {4}defaultConfig \{\n/m,
      (m) => `${m}        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=250"
            }
        }
`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
