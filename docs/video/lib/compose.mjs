// Montagem: quadros do screencast -> vídeo de 30 fps constantes; registro de sons -> trilha;
// os dois num MP4 H.264 yuv420p + AAC 48 kHz estéreo, com +faststart. O ffmpeg roda com
// prioridade baixa e 4 threads, porque o PC está em uso.
import { spawn, spawnSync } from 'node:child_process';
import { setPriority } from 'node:os';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FFMPEG, FPS } from './env.mjs';

export function ffmpeg(args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', ...(quiet ? ['-loglevel', 'error'] : []), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      setPriority(p.pid, 10);
    } catch {}
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg saiu com ${code}: ${err.slice(-800)}`))));
  });
}

/** Saída de texto do ffmpeg (stderr) de uma análise, sem gerar arquivo. */
export function analyze(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return r.stderr;
}

export function measureTruePeak(file) {
  const out = analyze(['-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const m = /True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(out);
  return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : NaN;
}

/** Lista de concatenação: cada quadro dura até o próximo carimbo. */
function concatList(frames, durationMs, file) {
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const end = i + 1 < frames.length ? frames[i + 1].ms : durationMs;
    const d = Math.max(1, end - frames[i].ms) / 1000;
    lines.push(`file '${frames[i].file.replace(/\\/g, '/')}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  writeFileSync(file, lines.join('\n'));
}

/**
 * Ganho fixo da trilha, o mesmo em todos os clipes, para o alarme e o bipe terem o mesmo volume
 * em qualquer clipe. +4,5 dB deixa o trecho mais alto (alarme e bipe juntos) em cerca de -1,5 dBTP.
 */
export const TRACK_GAIN_DB = 4.5;

/**
 * Monta o MP4 final. `audioWav` é a trilha de renderTrack(), com o ganho fixo TRACK_GAIN_DB
 * (com fixedGainDb: null, o ganho que põe o pico real em `targetTp`). Se o AAC passar do teto
 * de -1 dBTP, refaz com menos ganho.
 */
export async function composeClip({ frames, durationMs, audioWav, workDir, outFile, targetTp = -1.5, hasSound = true, fixedGainDb = TRACK_GAIN_DB }) {
  const list = join(workDir, 'quadros.ffconcat');
  concatList(frames, durationMs, list);
  const seconds = (durationMs / 1000).toFixed(3);
  let gainDb = 0;
  if (hasSound && fixedGainDb !== null) gainDb = fixedGainDb;
  else if (hasSound) {
    const tp = measureTruePeak(audioWav);
    gainDb = Number.isFinite(tp) ? targetTp - tp : 0;
  }
  const video = [
    '-vf',
    `fps=${FPS},scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '4.1', '-g', String(FPS * 2),
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-fps_mode', 'cfr', '-threads', '4',
  ];
  const audioIn = hasSound ? ['-i', audioWav] : ['-f', 'lavfi', '-t', seconds, '-i', 'anullsrc=r=48000:cl=stereo'];
  const audio = ['-af', `volume=${gainDb.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
  const encode = (g) =>
    ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, ...audioIn, '-map', '0:v', '-map', '1:a', ...video, ...audio.map((a) => (a.startsWith('volume=') ? `volume=${g.toFixed(2)}dB` : a)), '-t', seconds, '-movflags', '+faststart', outFile]);
  await encode(gainDb);
  // O AAC pode subir o pico: mede o arquivo final e, se passar de -1 dBTP, refaz com menos ganho.
  let finalTp = hasSound ? measureTruePeak(outFile) : -Infinity;
  if (hasSound && finalTp > -1.0) {
    gainDb -= finalTp - targetTp;
    await encode(gainDb);
    finalTp = measureTruePeak(outFile);
  }
  return { gainDb, truePeak: finalTp };
}

/** Conferência rápida do arquivo final: formato, duração, silêncio. */
export function inspect(file) {
  const info = analyze(['-i', file]);
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const v = /Stream #0:\d+.*Video: (\w+)[^,]*, (\w+)[^,]*(?:\([^)]*\))?, (\d+)x(\d+)[^\n]*?([\d.]+) fps/.exec(info);
  const a = /Stream #0:\d+.*Audio: (\w+)[^,]*, (\d+) Hz, (\w+)/.exec(info);
  return {
    raw: info.split('\n').filter((l) => /Duration|Stream/.test(l)).map((l) => l.trim()),
    seconds: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : NaN,
    video: v ? { codec: v[1], pixfmt: v[2], width: Number(v[3]), height: Number(v[4]), fps: Number(v[5]) } : null,
    audio: a ? { codec: a[1], rate: Number(a[2]), layout: a[3] } : null,
  };
}

/** Trechos de silêncio (abaixo de -90 dB) do áudio do arquivo. */
export function silences(file, noiseDb = -90, minS = 0.05) {
  const out = analyze(['-i', file, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=${minS}`, '-f', 'null', '-']);
  const res = [];
  let start = null;
  for (const line of out.split('\n')) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (s) start = Number(s[1]);
    if (e) {
      res.push([Math.max(0, start ?? 0), Number(e[1])]);
      start = null;
    }
  }
  if (start !== null) res.push([start, null]);
  return res;
}

/** Extrai quadros nos instantes dados (s), em PNG, para conferir a olho. */
export async function extractFrames(file, times, dir) {
  const out = [];
  for (const t of times) {
    const f = join(dir, `quadro-${t.toFixed(2).replace('.', '_')}s.png`);
    await ffmpeg(['-y', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', f]);
    out.push(f);
  }
  return out;
}
