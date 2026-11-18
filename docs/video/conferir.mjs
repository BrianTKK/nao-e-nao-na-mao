// Conferência de um clipe pronto: formato (ffmpeg -i), silêncio (-90 dB), pico real e quadros.
//
//   node docs/video/conferir.mjs mariana-cena-04 2 6.5 12      quadros nos instantes dados (s)
//
// Os quadros saem em <OUT>/trabalho/<clipe>/conferencia/.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DIRS } from './lib/env.mjs';
import { analyze, extractFrames, inspect, measureTruePeak, silences } from './lib/compose.mjs';

const [name, ...times] = process.argv.slice(2);
if (!name) {
  console.log('Uso: node docs/video/conferir.mjs <clipe> [instantes em s...]');
  process.exit(1);
}
const file = join(DIRS.final, `${name}.mp4`);
const info = inspect(file);
console.log(info.raw.join('\n'));
console.log(`duração ${info.seconds.toFixed(2)} s; vídeo ${JSON.stringify(info.video)}; áudio ${JSON.stringify(info.audio)}`);
const frameCount = /frame=\s*(\d+)/.exec(analyze(['-i', file, '-map', '0:v', '-f', 'null', '-']))?.[1];
console.log(`quadros: ${frameCount}`);
const vol = analyze(['-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
console.log(`max_volume: ${/max_volume: (\S+ dB)/.exec(vol)?.[1] ?? '?'}`);
console.log(`pico real: ${measureTruePeak(file)} dBTP`);
console.log(`silêncio (-90 dB): ${silences(file).map(([a, b]) => `${a.toFixed(3)} a ${b === null ? 'fim' : b.toFixed(3)}`).join('; ') || 'nenhum'}`);
if (times.length) {
  const dir = join(DIRS.work, name, 'conferencia');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const out = await extractFrames(file, times.map(Number), dir);
  console.log(out.join('\n'));
}
