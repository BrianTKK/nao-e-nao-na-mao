// Registro e montagem dos sons. O roteiro só diz QUANDO o alerta tocaria (o instante em que a
// tela mostrou o alerta novo) e QUANDO pararia (o instante em que virou "Visto"); as regras de
// repetição vêm do próprio código do produto:
//  - alarme do app (mobile/src/notifications/alarm.ts e hooks/useActiveAlerts.ts): o arquivo
//    mobile/assets/sounds/mariana_alarme.wav toca inteiro quando o alerta novo chega, de novo
//    nos ALARM_REPEAT_AT_S (shared/src/alarm.ts) se ninguém viu, e é cortado quando alguém vê
//    (silence() tira a notificação, e o Android para o som dela);
//  - bipe do painel (web/src/pages/panel/useWebAlarm.ts): com "Alarme ligado", três tons de
//    onda quadrada (880, 660 e 880 Hz, 0,2 s cada, a cada 0,22 s, ganho 0,25 com rampas
//    exponenciais) logo que aparece alerta novo e a cada BEEP_EVERY_MS, até não haver alerta novo.
// O áudio sai em 48 kHz estéreo, com silêncio digital (zeros) fora dos sons.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALARM_WAV, FFMPEG, REPO } from './env.mjs';

const RATE = 48_000;

function productConstants() {
  const alarm = readFileSync(join(REPO, 'shared', 'src', 'alarm.ts'), 'utf8');
  const repeat = JSON.parse(/ALARM_REPEAT_AT_S = (\[[^\]]+\])/.exec(alarm)[1]);
  const web = readFileSync(join(REPO, 'web', 'src', 'pages', 'panel', 'useWebAlarm.ts'), 'utf8');
  const beepEvery = Number(/BEEP_EVERY_MS = (\d+)/.exec(web)[1]);
  const freqs = JSON.parse(/for \(const \[i, freq\] of (\[[^\]]+\])\.entries\(\)\)/.exec(web)[1]);
  return { repeat, beepEvery, freqs };
}

let alarmPcm = null;
/** O alarme decodificado em float 48 kHz estéreo (intercalado). */
function alarmSamples() {
  if (!alarmPcm) {
    const raw = execFileSync(FFMPEG, ['-v', 'error', '-i', ALARM_WAV, '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-'], { maxBuffer: 64 << 20 });
    alarmPcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  }
  return alarmPcm;
}
export const alarmDurationMs = () => Math.round((alarmSamples().length / 2 / RATE) * 1000);

/** Onda quadrada limitada em banda (soma das harmônicas ímpares, como o OscillatorNode), pico 1. */
function square(freq) {
  const harmonics = [];
  for (let k = 1; k * freq < 20_000; k += 2) harmonics.push(k);
  const raw = (phase) => harmonics.reduce((s, k) => s + Math.sin(2 * Math.PI * k * phase) / k, 0);
  let max = 0;
  for (let i = 0; i < 4000; i++) max = Math.max(max, Math.abs(raw(i / 4000)));
  return (t) => raw(t * freq) / max;
}

/** O bipe de três tons, em float mono 48 kHz, igual ao do painel. */
function beepSamples() {
  const { freqs } = productConstants();
  const len = Math.ceil(RATE * (0.22 * (freqs.length - 1) + 0.21));
  const out = new Float32Array(len);
  freqs.forEach((freq, i) => {
    const wave = square(freq);
    const t0 = i * 0.22;
    const start = Math.round(t0 * RATE);
    const stop = Math.min(len, Math.round((t0 + 0.21) * RATE));
    for (let j = start; j < stop; j++) {
      const u = j / RATE - t0;
      // setValueAtTime(0.0001), exponentialRamp até 0.25 em 0,02 s e até 0.0001 em 0,2 s
      const g = u < 0.02 ? 0.0001 * Math.pow(0.25 / 0.0001, u / 0.02) : u < 0.2 ? 0.25 * Math.pow(0.0001 / 0.25, (u - 0.02) / 0.18) : 0.0001;
      out[j] += g * wave(u);
    }
  });
  return out;
}
export const BEEP_MS = 650;

/** Toques do alarme do app: chega em `startMs`, alguém vê em `seenMs` (ou nunca: Infinity). */
export function alarmEvents(startMs, seenMs = Infinity) {
  const { repeat } = productConstants();
  const dur = alarmDurationMs();
  return [0, ...repeat.map((s) => s * 1000)]
    .map((off) => startMs + off)
    .filter((t) => t < seenMs)
    .map((t, i) => ({ som: 'alarme', origem: i === 0 ? 'app: alerta novo' : 'app: repetição (ninguém viu)', inicioMs: t, fimMs: Math.min(t + dur, seenMs) }));
}

/** Bipes do painel: alerta novo aparece em `startMs`, deixa de haver alerta novo em `stopMs`. */
export function beepEvents(startMs, stopMs) {
  const { beepEvery } = productConstants();
  const out = [];
  for (let t = startMs; t < stopMs; t += beepEvery) out.push({ som: 'bipe', origem: 'painel: bipe de alerta novo', inicioMs: t, fimMs: t + BEEP_MS });
  return out;
}

/** Monta a trilha (f32 estéreo 48 kHz) e grava em WAV float. Devolve o pico de amostra. */
export function renderTrack(events, durationMs, outWav) {
  const frames = Math.ceil((durationMs / 1000) * RATE);
  const mix = new Float32Array(frames * 2);
  const alarm = alarmSamples();
  const beep = beepSamples();
  for (const e of events) {
    const s0 = Math.round((e.inicioMs / 1000) * RATE);
    const s1 = Math.min(frames, Math.round((e.fimMs / 1000) * RATE));
    if (e.som === 'alarme') {
      for (let i = s0; i < s1; i++) {
        const k = i - s0;
        if (k * 2 + 1 >= alarm.length) break;
        // corte com rampa de 5 ms quando alguém vê o alerta no meio do som
        const fade = Math.min(1, (s1 - i) / (RATE * 0.005));
        mix[i * 2] += alarm[k * 2] * fade;
        mix[i * 2 + 1] += alarm[k * 2 + 1] * fade;
      }
    } else if (e.som === 'bipe') {
      for (let k = 0; k < beep.length && s0 + k < frames; k++) {
        mix[(s0 + k) * 2] += beep[k];
        mix[(s0 + k) * 2 + 1] += beep[k];
      }
    }
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const raw = outWav.replace(/\.wav$/, '.f32');
  writeFileSync(raw, Buffer.from(mix.buffer));
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', raw, '-c:a', 'pcm_f32le', outWav]);
  return { peakDb: 20 * Math.log10(peak || 1e-9) };
}
