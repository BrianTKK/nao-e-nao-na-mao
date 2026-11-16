// Serve o app para o Expo Go pela internet (serviço `expo` do compose, na VPS).
// Sobe o Metro em modo de produção (--no-dev --minify) e, quando ele responde,
// "aquece" os bundles de Android e iOS: assim a primeira pessoa a ler o QR não
// espera os ~30 s da primeira montagem.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(mobile, 'package.json'));
const cli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const port = process.env.PORT ?? '8081';
const workers = process.env.METRO_MAX_WORKERS ?? '2';

const metro = spawn(process.execPath, [cli, 'start', '--no-dev', '--minify', '--port', port, '--max-workers', workers], {
  cwd: mobile,
  stdio: 'inherit',
  env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => metro.kill(signal));
metro.on('exit', (code) => process.exit(code ?? 1));

const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function manifest(platform) {
  const res = await fetch(`${base}/`, {
    headers: { 'expo-platform': platform, accept: 'multipart/mixed,application/expo+json,application/json' },
  });
  if (!res.ok) throw new Error(`manifesto ${platform}: ${res.status}`);
  const text = await res.text();
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json.split('\r\n------')[0]);
}

async function warm() {
  for (let i = 0; i < 120; i++) {
    try {
      await manifest('android');
      break;
    } catch {
      await sleep(1000);
    }
  }
  for (const platform of ['android', 'ios']) {
    try {
      const m = await manifest(platform);
      // O launchAsset aponta para o endereço público; o aquecimento usa o local.
      const url = new URL(m.launchAsset.url);
      const started = Date.now();
      const res = await fetch(`${base}${url.pathname}${url.search}`);
      await res.arrayBuffer();
      console.log(`[serve-public] bundle ${platform} pronto: ${res.status} em ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
      console.error(`[serve-public] não aqueceu ${platform}:`, err.message);
    }
  }
}

warm();
