// Peças comuns dos clipes de produto: as três telas do roteiro e as esperas de "tudo pronto".
import { API, APP } from './env.mjs';

export const PANE_ELA = { id: 'ela', url: `${API}/q/ESQBF7K2`, label: 'Página dela, pelo QR code' };
export const PANE_APP = { id: 'app', url: APP, label: 'App da equipe' };
export const PANE_PAINEL = { id: 'painel', url: `${API}/painel`, label: 'Painel da gerência', title: 'Painel do bar' };
export const TRIO_PANES = [PANE_ELA, PANE_APP, PANE_PAINEL];

/** Espera cada tela presente no palco ficar pronta no estado inicial (sem pedido, sem alerta). */
export async function waitInitial({ page, frames }) {
  const waits = [];
  if (frames.ela) waits.push(page.frameLocator('#ela').getByRole('button', { name: /Estou me sentindo insegura/ }).waitFor({ timeout: 60_000 }));
  if (frames.app) waits.push(page.frameLocator('#app').getByText('Nenhum alerta agora').first().waitFor({ timeout: 240_000 }));
  if (frames.painel) waits.push(page.frameLocator('#painel').getByText('Nenhum alerta em aberto.').waitFor({ timeout: 60_000 }));
  await Promise.all(waits);
  for (const f of Object.values(frames)) await f.evaluate(() => document.fonts.ready).catch(() => {});
}

/** Espera um texto aparecer num iframe (fora da gravação) e devolve o Date.now() da página. */
export async function waitText(frame, text, timeout = 30_000) {
  const h = await frame.waitForFunction((t) => (document.body?.innerText.includes(t) ? Date.now() : false), text, { timeout, polling: 200 });
  return h.jsonValue();
}

export const visibleButton = (fl, name) => fl.getByRole('button', { name }).filter({ visible: true }).first();

/**
 * Fora da gravação: ela toca em "Estou me sentindo insegura" pela página dela (o pedido fica no
 * sessionStorage dela, como de verdade). Devolve os instantes (Date.now) em que o alerta chegou
 * ao app e o painel começou a bipar, para os sons que caem dentro do clipe.
 */
export async function herRequest({ page, frames }) {
  await page.frameLocator('#ela').getByRole('button', { name: /Estou me sentindo insegura/ }).click();
  const [appWall, panelWall] = await Promise.all([
    frames.app ? waitText(frames.app, '1 alerta') : null,
    frames.painel
      ? frames.painel.waitForFunction(() => (document.querySelector('.panel-alarm-ringing') ? Date.now() : false), null, { timeout: 30_000, polling: 'raf' }).then((h) => h.jsonValue())
      : null,
  ]);
  await waitText(frames.ela, 'Sua palavra-código');
  return { appWall, panelWall };
}

/**
 * Espera o alarme do app terminar e, se o painel estiver bipando, um instante em que a gravação
 * comece no meio do intervalo entre dois bipes (o gravador começa cerca de 1,6 s depois do ready).
 */
export async function waitSoundGap({ appWall, panelWall }, { alarmMs = 2940, beepEvery = 2500, startDelay = 1600 } = {}) {
  const minStart = (appWall ?? 0) + alarmMs + 400;
  for (;;) {
    const start = Date.now() + startDelay;
    const phase = panelWall ? (start - panelWall) % beepEvery : 1000;
    if (start >= minStart && phase > 900 && phase < 1300) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Sons que já tinham começado antes do clipe: guarda só os que ainda tocam depois do zero. */
export const inClip = (events) => events.filter((e) => e.fimMs > 0);
