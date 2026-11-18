// Captura sem a compressão do recordVideo: o screencast do Chrome (CDP Page.startScreencast)
// entrega cada quadro em JPEG de alta qualidade com o carimbo de tempo da troca de quadro.
// Os quadros vão para o disco e o ffmpeg monta um vídeo de 30 fps constantes (compose.mjs),
// cada quadro durando até o carimbo do seguinte. O relógio comum é o Date.now() do Node:
// `now()` devolve o tempo do clipe em ms, e as marcas (toques, sons) usam o mesmo relógio.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WIDTH, HEIGHT } from './env.mjs';

export async function startRecorder(page, { framesDir, quality = 95 }) {
  const cdp = await page.context().newCDPSession(page);
  const frames = []; // { file, ts } ts = segundos (relógio do Chrome)
  // Diferença entre o relógio do Node e o carimbo do Chrome: o menor valor visto é o de menor atraso.
  let offset = Infinity;
  let pending = Promise.resolve();
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const arrived = Date.now() / 1000;
    offset = Math.min(offset, arrived - metadata.timestamp);
    const file = join(framesDir, `${String(frames.length + 1).padStart(6, '0')}.jpg`);
    frames.push({ file, ts: metadata.timestamp });
    writeFileSync(file, Buffer.from(data, 'base64'));
    pending = cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  // Espera o primeiro quadro: o zero do clipe é o carimbo dele.
  const t0 = Date.now();
  while (frames.length === 0) {
    if (Date.now() - t0 > 10_000) throw new Error('o screencast não mandou quadro');
    await new Promise((r) => setTimeout(r, 20));
  }
  const zeroTs = () => frames[0].ts;
  /** Tempo do clipe (ms) de um instante do relógio do Node (Date.now()). */
  const clipMs = (wall) => Math.round((wall / 1000 - offset - zeroTs()) * 1000);
  return {
    clipMs,
    now: () => clipMs(Date.now()),
    async stop() {
      const endWall = Date.now();
      await pending;
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      const z = zeroTs();
      const list = frames.map((f) => ({ file: f.file, ms: Math.round((f.ts - z) * 1000) }));
      return { frames: list, durationMs: clipMs(endWall), offset };
    },
  };
}
