// Empacota o servidor (e o pacote shared, que é TypeScript) em dist/.
// As dependências de node_modules ficam de fora e são instaladas na imagem.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@nenm/shared');
// Dependências do shared que o servidor importa indiretamente.
external.push('socket.io-client');

await build({
  entryPoints: { index: 'src/index.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
