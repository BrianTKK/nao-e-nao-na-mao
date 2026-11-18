// mariana-cena-10.mp4: acessibilidade (cena 10 do roteiro), em quatro trechos seguidos:
// (a) a página dela com texto a 200% (195 px de largura); (b) o painel só com o teclado, com o
// foco visível; (c) o selo de estado com ícone e texto; (d) "Reduzir movimento" no app, e o
// alerta novo sem pulso.
import { cond } from '../lib/actions.mjs';
import { API, APP } from '../lib/env.mjs';
import { api, token } from '../lib/session.mjs';
import { visibleButton } from '../lib/trio.mjs';

const ELA = `${API}/q/ESQBF7K2`;
const PHONE_Y = 128;

/** Anima a rolagem de uma página até `top` em `ms`, com aceleração suave. */
const scrollTo = (frame, top, ms) =>
  frame.evaluate(
    ({ top, ms }) =>
      new Promise((done) => {
        const from = window.scrollY;
        const to = Math.min(top, document.documentElement.scrollHeight - window.innerHeight);
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          window.scrollTo(0, from + (to - from) * e);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    { top, ms },
  );

export const clip = {
  file: 'mariana-cena-10.mp4',
  scene: '10, Acessibilidade (2:03 a 2:21)',
  summary: 'Acessibilidade em quatro trechos: texto a 200% na página dela, o painel só no teclado com o foco visível, o selo de estado com ícone e texto, e "Reduzir movimento" tirando o pulso do alerta novo.',
  speech: [
    'Acessibilidade desde o início: contraste testado; texto a 200%, que vira 195 pixels de largura, sem quebrar o layout; navegação só pelo teclado; estados com ícone e texto, não só cor; e "Reduzir movimento", que desliga animações e pulso.',
  ],
  notes: [
    'Trecho (a): à esquerda, a página dela como no celular (390 px); à direita, a mesma página aberta com 195 px de largura e ampliada 2 vezes, que é o que acontece com o texto a 200%. A página desce sozinha para mostrar que nada se sobrepõe.',
    'Trecho (b): só a tecla Tab, sem mouse. A tecla desenhada embaixo é um realce de edição; o contorno amarelo em volta de cada botão é o foco do próprio painel.',
    'Trecho (c): aproximação do palco (não é zoom do navegador) nos selos "Novo" e "A caminho" do painel: cada estado tem ícone e texto, não só cor.',
    'Trecho (d): no app, Ajustes, chave "Reduzir movimento" ligada; de volta à lista, o alerta novo fica parado, sem pulso. No começo do trecho, antes da chave, ele pulsa.',
    'Contraste: o teste automático está em shared/src/__tests__/tokens.test.ts; o clipe não mostra número de razão. Leitor de tela não foi testado com TalkBack, VoiceOver nem NVDA: não afirmar que foi.',
    'Sem som: os dois alertas já existiam quando o app abriu (o app não toca alarme para o que já estava na lista ao abrir), e o alarme do painel está desligado neste clipe.',
    'Cada trecho tem mais que os 3 a 4 s do roteiro; a edição corta.',
  ],
  preset: 'custom',
  panes: [
    { id: 'ela', kind: 'phone', url: ELA, label: 'Página dela, texto a 100%', x: 486, y: PHONE_Y, w: 390, h: 844, group: 'a' },
    { id: 'ela2', kind: 'phone', url: ELA, label: 'Texto a 200%: a página com 195 px', x: 1020, y: PHONE_Y, w: 390, h: 844, zoom: 2, group: 'a' },
    { id: 'painel', kind: 'window', url: `${API}/painel`, label: 'Painel da gerência, só com o teclado', title: 'Painel do bar', x: 159, y: 113, w: 1600, h: 860, group: 'b', hidden: true },
    { id: 'app', kind: 'phone', url: APP, label: 'App da equipe', x: 753, y: PHONE_Y, w: 390, h: 844, group: 'd', hidden: true },
  ],
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: false,
  /** Antes de as telas abrirem: um alerta "A caminho" (banheiro masculino) e um novo (mesa 7). */
  async before() {
    const marta = await token('marta');
    const diego = await token('diego');
    const create = async (spotCode) => {
      const ids = new Set(((await api('/staff/alerts/active', { token: marta })).body ?? []).map((a) => a.id));
      const r = await api('/alerts', { body: { spotCode, kind: 'unsafe' } });
      if (r.status !== 201) throw new Error(`pedido recusado (${r.status}): limite de pedidos?`);
      return ((await api('/staff/alerts/active', { token: marta })).body ?? []).find((a) => !ids.has(a.id)).id;
    };
    const onTheWay = await create('ESQBM4P9');
    await api(`/staff/alerts/${onTheWay}/ack`, { token: diego, body: {} });
    const s = await api(`/staff/alerts/${onTheWay}/start`, { token: diego, body: {} });
    if (s.status !== 200) throw new Error(`"Estou indo" recusado (${s.status})`);
    await create('ESQM07H6');
  },
  async ready({ page, frames }) {
    await page.frameLocator('#ela').getByRole('button', { name: /Estou me sentindo insegura/ }).waitFor({ timeout: 60_000 });
    await page.frameLocator('#ela2').getByRole('button', { name: /Estou me sentindo insegura/ }).waitFor({ timeout: 60_000 });
    await page.frameLocator('#app').getByText('2 alertas').first().waitFor({ timeout: 240_000 });
    await page.frameLocator('#painel').getByText('Mesa 7').first().waitFor({ timeout: 60_000 });
    await page.frameLocator('#painel').getByText('Banheiro masculino').first().waitFor({ timeout: 60_000 });
    for (const f of Object.values(frames)) await f.evaluate(() => document.fonts.ready).catch(() => {});
  },
  async run({ page, frames, act }) {
    const painel = page.frameLocator('#painel');
    const app = page.frameLocator('#app');
    const { tap, pause, when, mark } = act;

    // (a) Texto a 200%.
    mark('ela', '(a) Texto a 200%: à esquerda a página a 100%; à direita a mesma página com 195 px de largura, ampliada', undefined, 'Acessibilidade desde o início: contraste testado; texto a 200%, que vira 195 pixels de largura, sem quebrar o layout;');
    await pause(2500);
    await scrollTo(frames.ela2, 2000, 2600);
    mark('ela', 'A página a 200% desce até o fim: o texto quebra em linhas, nada se sobrepõe');
    await pause(1800);

    // (b) Só o teclado.
    await act.stage('showGroup', 'b');
    mark('painel', '(b) Troca para o painel da gerência', undefined, 'navegação só pelo teclado;');
    await pause(1200);
    await page.locator('#painel').focus();
    for (let i = 0; i < 13; i++) {
      await act.key('Tab', { evento: i === 0 ? 'Tecla Tab: o foco (contorno amarelo) entra no painel e passa de botão em botão' : undefined, tela: 'painel', pauseMs: i === 0 ? 0 : 520 });
    }
    await pause(900);
    await act.keyHide();
    mark('painel', 'Fim das teclas: o foco está nos botões do cartão');
    await pause(1200);

    // (c) Selos com ícone e texto.
    await frames.painel.evaluate(() => document.activeElement?.blur());
    const tops = painel.locator('.live-item .live-top');
    const b0 = await tops.nth(0).boundingBox();
    const b1 = await tops.nth(1).boundingBox();
    await act.stage('show', '[data-label="painel"]', false);
    await act.stage('zoom', 'painel', 2.2, b0.x + 150, b0.y + b0.height / 2 + 30);
    mark('painel', '(c) Aproximação no selo do primeiro cartão: ícone e texto', undefined, 'estados com ícone e texto, não só cor;');
    await pause(3200);
    await act.stage('zoom', 'painel', 2.2, b1.x + 150, b1.y + b1.height / 2 + 30);
    mark('painel', 'Aproximação no selo do segundo cartão: ícone e texto');
    await pause(3200);
    await act.stage('zoom', 'painel', 1);
    await act.stage('show', '[data-label="painel"]', true);
    await pause(1300);

    // (d) Reduzir movimento.
    await act.stage('showGroup', 'd');
    mark('app', '(d) Troca para o app: o alerta novo da mesa 7 pulsa na lista', undefined, 'e "Reduzir movimento",');
    await tap(visibleButton(app, 'Ajustes'), { tela: 'app', evento: 'Toca em "Ajustes"', pauseMs: 2600 });
    const sw = app.getByRole('switch', { name: 'Reduzir movimento' });
    await sw.waitFor({ timeout: 10_000 });
    await tap(sw, { tela: 'app', evento: 'Liga a chave "Reduzir movimento"', pauseMs: 1800, fala: 'que desliga animações e pulso.' });
    await pause(1600);
    const back = app.getByRole('link', { name: /back/i }).filter({ visible: true }).first();
    await tap(back, { tela: 'app', evento: 'Volta para a lista', pauseMs: 600 });
    await when(frames.app, cond.text, '2 alertas', { tela: 'app', evento: 'De volta à lista: o alerta novo da mesa 7 fica parado, sem pulso' });
    await pause(5000);
    mark('todas', 'Fim');
    return { sounds: [] };
  },
};
