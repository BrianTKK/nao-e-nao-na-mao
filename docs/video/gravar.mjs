// Gravação automática dos clipes da Mariana (produto rodando local, sem som além dos alarmes).
//
//   node docs/video/gravar.mjs mariana-integracao     um clipe (nome do arquivo em clips/, sem .mjs)
//   node docs/video/gravar.mjs todos                  todos os clipes de clips/, um depois do outro
//   node docs/video/gravar.mjs <clipe> --previa       só monta o palco e salva uma captura (sem gravar)
//   node docs/video/gravar.mjs <clipe> --remontar     refaz o MP4 a partir da última gravação bruta
//   node docs/video/gravar.mjs <clipe> --folha        refaz só a folha de marcação e o clipes.json
//
// Precisa do servidor local (8150) e do Expo web (8151) no ar: ver docs/video/README.md.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { API, APP, DIRS, VIDEO_DIR, clipDirs, ensureDirs, sleep, WIDTH, HEIGHT } from './lib/env.mjs';
import { closeOpenAlerts, token } from './lib/session.mjs';
import { layout, prepareContext, startStageServer } from './lib/stage.mjs';
import { startRecorder } from './lib/recorder.mjs';
import { createActions } from './lib/actions.mjs';
import { renderTrack } from './lib/sounds.mjs';
import { composeClip, inspect } from './lib/compose.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = args.filter((a) => !a.startsWith('--'));
const clipsDir = join(VIDEO_DIR, 'clips');
const all = readdirSync(clipsDir).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const wanted = names.includes('todos') ? all : names;
if (wanted.length === 0) {
  console.log(`Uso: node docs/video/gravar.mjs <${all.join(' | ')} | todos> [--previa | --remontar]`);
  process.exit(1);
}

const fmt = (ms) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

async function checkServers() {
  const h = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => null);
  if (!h?.ok) throw new Error(`Servidor local fora do ar em ${API} (ver README)`);
  const a = await fetch(APP).then((r) => r.status).catch(() => 0);
  if (a !== 200) throw new Error(`Expo web fora do ar em ${APP} (ver README)`);
}

const TELAS = { ela: 'Página dela', app: 'App da equipe', painel: 'Painel', todas: 'Todas', cartela: 'Cartela', palco: 'Palco' };
const somNome = (s) => (s.som === 'alarme' ? 'Alarme do app' : 'Bipe do painel');

/** Folha de marcação: tabela de tempos tirada do registro da gravação, com a fala do roteiro. */
function writeSheet(name, clip, log) {
  const rows = [
    ...log.marks.map((m) => ({ ms: m.ms, tela: TELAS[m.tela] ?? m.tela, tela_: m.evento, som: '', fala: m.fala ?? '' })),
    ...log.sounds.map((s) => ({ ms: s.inicioMs, tela: 'Som', tela_: '', som: `${somNome(s)} começa (${s.origem}); termina em ${fmt(s.fimMs)}`, fala: '' })),
  ].sort((a, b) => a.ms - b.ms);
  const cell = (t) => String(t).replace(/\|/g, '/');
  const md = [
    `# Folha de marcação: ${clip.file}`,
    '',
    clip.summary,
    '',
    ...(clip.scene ? [`Cena do roteiro: ${clip.scene} (docs/pdf/Roteiro_Video.md).`, ''] : []),
    `Duração: ${fmt(log.durationMs)} (${(log.durationMs / 1000).toFixed(1)} s). 1920x1080, 30 fps. Gravado em ${log.recordedAt.slice(0, 10)}.`,
    'Tempos tirados do registro da gravação (mm:ss.d, desde o início do clipe), não estimados.',
    log.sounds.length
      ? 'Fora dos sons listados, o áudio é silêncio total: a dublagem entra por cima.'
      : 'Sem som nenhum: o áudio é silêncio total do começo ao fim, e a dublagem entra por cima.',
    '',
    ...(clip.speech ? ['## Fala sugerida (texto do roteiro)', '', ...[].concat(clip.speech).map((f) => `> ${f}`), ''] : []),
    '## Linha do tempo',
    '',
    '| Tempo | Onde | O que acontece na tela | Som | Fala sugerida |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${fmt(r.ms)} | ${r.tela} | ${cell(r.tela_)} | ${cell(r.som)} | ${cell(r.fala)} |`),
    '',
    ...(clip.notes?.length ? ['## Observações', '', ...clip.notes.map((n) => `- ${n}`), ''] : []),
  ].join('\n');
  mkdirSync(join(VIDEO_DIR, 'marcacao'), { recursive: true });
  writeFileSync(join(VIDEO_DIR, 'marcacao', `${name}.md`), md);
}

function updateManifest(clip, seconds, log) {
  const file = join(VIDEO_DIR, 'clipes.json');
  const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const entry = {
    arquivo: clip.file,
    cena: clip.scene ?? null,
    duracao_s: Math.round(seconds * 10) / 10,
    resumo: clip.summary,
    sons: (log?.sounds ?? []).map((s) => ({ som: somNome(s), inicio_s: Math.round(s.inicioMs) / 1000, fim_s: Math.round(s.fimMs) / 1000 })),
  };
  const i = list.findIndex((c) => c.arquivo === clip.file);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  list.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
}

async function compose(name, clip, log, dirs) {
  const wav = join(dirs.work, 'trilha.wav');
  const hasSound = log.sounds.length > 0;
  if (hasSound) renderTrack(log.sounds, log.durationMs, wav);
  const outFile = join(DIRS.final, clip.file);
  console.log('  montando o MP4...');
  const { gainDb, truePeak } = await composeClip({ frames: log.frames, durationMs: log.durationMs, audioWav: wav, workDir: dirs.work, outFile, hasSound });
  const info = inspect(outFile);
  // O registro dos sons fica ao lado do clipe.
  writeFileSync(outFile.replace(/\.mp4$/, '.sons.json'), `${JSON.stringify({ arquivo: clip.file, duracaoMs: log.durationMs, ganhoDb: Number(gainDb.toFixed(2)), picoRealDbtp: truePeak, sons: log.sounds, marcas: log.marks }, null, 2)}\n`);
  writeSheet(name, clip, log);
  updateManifest(clip, info.seconds, log);
  console.log(`  ${outFile}: ${info.seconds.toFixed(2)} s, ${JSON.stringify(info.video)}, ${JSON.stringify(info.audio)}, ganho ${gainDb.toFixed(2)} dB, pico real ${truePeak} dBTP`);
}

async function record(name, clip, dirs) {
  await checkServers();
  const closed = await closeOpenAlerts();
  if (closed) console.log(`  ${closed} alerta(s) aberto(s) encerrado(s) antes da tomada`);
  const sessions = {};
  if (clip.sessions?.app) sessions.app = await token(clip.sessions.app);
  if (clip.sessions?.panel) sessions.panel = await token(clip.sessions.panel);
  // Preparação antes de as telas abrirem (ex.: alertas que já existem quando o app carrega).
  if (clip.before) await clip.before();

  const panes = layout(clip.preset, clip.panes);
  const stage = await startStageServer(panes);
  // Sem a checagem de acesso à rede local, que bloqueia o app (8151) de falar com o servidor
  // (8150) dentro do iframe do palco. Vale só para este navegador de gravação.
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=LocalNetworkAccessChecks'] });
  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'no-preference',
    });
    await context.grantPermissions(['notifications'], { origin: API });
    const { blocked } = await prepareContext(context, { panes, sessions, panelAlarm: clip.panelAlarm, offlineSwitch: clip.offlineSwitch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(stage.url);
    // As cartelas usam as fontes e as imagens do palco: espera tudo carregar antes de gravar.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const frames = {};
    for (const p of panes.filter((x) => x.kind !== "html")) {
      const deadline = Date.now() + 30_000;
      while (!(frames[p.id] = page.frame({ name: p.id }))) {
        if (Date.now() > deadline) throw new Error(`iframe ${p.id} não abriu`);
        await sleep(100);
      }
    }
    console.log('  esperando as telas carregarem (o primeiro pacote do Expo demora)...');
    try {
      await clip.ready({ page, frames });
    } catch (err) {
      await page.screenshot({ path: join(dirs.work, 'falha-ao-carregar.png') }).catch(() => {});
      throw new Error(`as telas não ficaram prontas (captura em ${join(dirs.work, 'falha-ao-carregar.png')}): ${String(err.message).split('\n')[0]}`);
    }
    await sleep(1500);

    if (flags.has('--previa')) {
      const shot = join(dirs.work, 'previa.png');
      await page.screenshot({ path: shot });
      console.log(`  prévia: ${shot}`);
      return null;
    }

    rmSync(dirs.frames, { recursive: true, force: true });
    mkdirSync(dirs.frames, { recursive: true });
    const rec = await startRecorder(page, { framesDir: dirs.frames });
    const act = createActions({ page, rec });
    console.log('  gravando:');
    const result = await clip.run({ page, frames, act, rec, context });
    const { frames: list, durationMs } = await rec.stop();
    if (blocked.length) throw new Error(`a página tentou falar com a produção: ${blocked[0]}`);
    if (errors.length) console.log(`  AVISO: erro de JavaScript na página: ${errors.slice(0, 2).join(' | ')}`);
    const log = { clip: clip.file, recordedAt: new Date().toISOString(), durationMs, frames: list, marks: act.marks, sounds: result?.sounds ?? [] };
    writeFileSync(join(dirs.raw, 'registro.json'), JSON.stringify(log, null, 2));
    console.log(`  ${list.length} quadros em ${(durationMs / 1000).toFixed(1)} s (média ${(list.length / (durationMs / 1000)).toFixed(1)} quadros/s)`);
    return log;
  } finally {
    await browser.close();
    await stage.close();
  }
}

ensureDirs();
for (const name of wanted) {
  const { clip } = await import(pathToFileURL(join(clipsDir, `${name}.mjs`)).href);
  const dirs = clipDirs(name);
  console.log(`\n== ${clip.file}`);
  let log;
  if (flags.has('--folha')) {
    log = JSON.parse(readFileSync(join(dirs.raw, 'registro.json'), 'utf8'));
    writeSheet(name, clip, log);
    updateManifest(clip, inspect(join(DIRS.final, clip.file)).seconds, log);
    console.log('  folha e clipes.json refeitos');
    continue;
  }
  if (flags.has('--remontar')) log = JSON.parse(readFileSync(join(dirs.raw, 'registro.json'), 'utf8'));
  else log = await record(name, clip, dirs);
  if (log) await compose(name, clip, log, dirs);
}
