// Ajudantes do roteiro: pausa, toque com indicador (celulares), clique com cursor (painel),
// espera de texto com o instante exato em que apareceu, e o registro de marcas para a folha.
import { sleep } from './env.mjs';

export function createActions({ page, rec, defaults = {} }) {
  const marks = []; // { ms, tela, evento }
  const PAUSE = defaults.pauseMs ?? 2000;
  const mark = (tela, evento, ms = rec.now(), fala) => {
    marks.push({ ms, tela, evento, ...(fala ? { fala } : {}) });
    console.log(`  ${(ms / 1000).toFixed(2).padStart(6)} s  [${tela}] ${evento}`);
    return ms;
  };

  const center = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error('elemento sem caixa (fora da tela?)');
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  };

  return {
    marks,
    mark,
    /** Pausa para a dublagem respirar (padrão 2 s). */
    pause: (ms = PAUSE) => sleep(ms),
    /**
     * Toque num celular: pausa, o círculo aparece no ponto, aperta, clica de verdade e some.
     * Devolve o instante (ms do clipe) do clique.
     */
    async tap(locator, { tela, evento, pauseMs = PAUSE, fala } = {}) {
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      await sleep(pauseMs);
      const p = await center(locator);
      await page.evaluate(({ x, y }) => window.__stage.tapShow(x, y), p);
      await sleep(380);
      await page.evaluate(() => window.__stage.tapPress());
      await sleep(90);
      const ms = rec.now();
      await locator.click({ timeout: 10_000 });
      if (evento) mark(tela, evento, ms, fala);
      await sleep(160);
      await page.evaluate(() => window.__stage.tapRelease());
      return ms;
    },
    /** Clique no painel: o cursor anda até o ponto, faz o anel e clica de verdade. */
    async click(locator, { tela, evento, pauseMs = PAUSE, moveMs = 700, fala } = {}) {
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      await sleep(pauseMs);
      const p = await center(locator);
      await page.evaluate(({ x, y, ms }) => window.__stage.cursorMove(x, y, ms), { ...p, ms: moveMs });
      await sleep(180);
      const ms = rec.now();
      await page.evaluate(() => window.__stage.cursorClick());
      await locator.click({ timeout: 10_000 });
      if (evento) mark(tela, evento, ms, fala);
      return ms;
    },
    /** Tecla com a tecla desenhada embaixo, no centro do palco. Devolve o instante (ms do clipe). */
    async key(name, { label = name, tela, evento, pauseMs = 0, fala } = {}) {
      await sleep(pauseMs);
      await page.evaluate((l) => { window.__stage.keyShow(l); window.__stage.keyPress(true); }, label);
      const ms = rec.now();
      await page.keyboard.press(name);
      if (evento) mark(tela, evento, ms, fala);
      await sleep(140);
      await page.evaluate(() => window.__stage.keyPress(false));
      return ms;
    },
    keyHide: () => page.evaluate(() => window.__stage.keyHide()),
    /** Chama uma função do palco (showGroup, setLabel, zoom, go...). */
    stage: (fn, ...args) => page.evaluate(({ fn, args }) => window.__stage[fn](...args), { fn, args }),
    cursorShow: (x, y) => page.evaluate(({ x, y }) => window.__stage.cursorShow(x, y), { x, y }),
    cursorMove: (x, y, ms = 700) => page.evaluate(({ x, y, ms }) => window.__stage.cursorMove(x, y, ms), { x, y, ms }),
    /**
     * Espera uma condição dentro de um iframe e devolve o instante (ms do clipe) em que ela
     * ficou verdadeira, medido na própria página (requestAnimationFrame), não no retorno ao Node.
     */
    async when(frame, kind, arg, { timeout = 30_000, tela, evento, fala } = {}) {
      if (!COND.includes(kind)) throw new Error(`condição desconhecida: ${kind} (use ${COND.join(', ')})`);
      // Função fixa: as páginas do produto têm CSP sem 'unsafe-eval', então nada de new Function.
      const handle = await frame.waitForFunction(
        ({ kind, arg }) => {
          const body = document.body;
          if (!body) return false;
          const ok =
            kind === 'text' ? body.innerText.includes(arg)
            : kind === 'noText' ? !body.innerText.includes(arg)
            : kind === 'content' ? body.textContent.includes(arg)
            : kind === 'noContent' ? !body.textContent.includes(arg)
            : kind === 'selector' ? !!document.querySelector(arg)
            : !document.querySelector(arg);
          return ok ? Date.now() : false;
        },
        { kind, arg },
        { timeout, polling: 'raf' },
      );
      const ms = rec.clipMs(await handle.jsonValue());
      if (evento) mark(tela, evento, ms, fala);
      return ms;
    },
  };
}

/**
 * Condições de `when`: texto visível (innerText, com a caixa que a tela mostra), texto do
 * documento (textContent, sem o efeito de text-transform) ou seletor CSS, presente ou ausente.
 */
const COND = ['text', 'noText', 'content', 'noContent', 'selector', 'noSelector'];
export const cond = { text: 'text', noText: 'noText', content: 'content', noContent: 'noContent', selector: 'selector', noSelector: 'noSelector' };
