// Caminhos, portas e ferramentas da gravação. Tudo pode ser trocado por variável de ambiente.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const VIDEO_DIR = resolve(here, '..');
export const REPO = resolve(VIDEO_DIR, '..', '..');

/** Servidor local (API, página do QR e painel, com a web compilada). */
export const API = process.env.VIDEO_API_URL ?? 'http://localhost:8150';
/** App da equipe no Expo web. */
export const APP = process.env.VIDEO_APP_URL ?? 'http://localhost:8151';
/** Origem da página "palco", servida pelo servidor do palco (lib/stage.mjs), que o gravador abre e fecha. */
export const STAGE = 'http://localhost:8153';

/** Pasta dos vídeos, fora do git. */
export const OUT = process.env.VIDEO_OUT ?? 'D:\\Video\\Mariana';
export const DIRS = {
  raw: join(OUT, 'bruto'),
  work: join(OUT, 'trabalho'),
  final: join(OUT, 'final'),
};

/** ffmpeg: FFMPEG=<caminho>, ou o do imageio-ffmpeg (Python 3.14 do usuário), ou o do PATH. */
const IMAGEIO_FFMPEG = join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'Lib', 'site-packages', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v9.0.2.exe');
export const FFMPEG = process.env.FFMPEG ?? (existsSync(IMAGEIO_FFMPEG) ? IMAGEIO_FFMPEG : 'ffmpeg');

/** O alarme do app (o mesmo arquivo do canal de notificação do APK). */
export const ALARM_WAV = join(REPO, 'mobile', 'assets', 'sounds', 'mariana_alarme.wav');

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export function ensureDirs() {
  for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });
  if (spawnSync(FFMPEG, ['-version']).status !== 0) throw new Error(`ffmpeg não encontrado (${FFMPEG}); defina FFMPEG=<caminho>`);
}

export function clipDirs(name) {
  const d = { raw: join(DIRS.raw, name), frames: join(DIRS.raw, name, 'quadros'), work: join(DIRS.work, name) };
  for (const p of Object.values(d)) mkdirSync(p, { recursive: true });
  return d;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
