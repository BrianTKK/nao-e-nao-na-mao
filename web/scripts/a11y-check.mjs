// Verificador de acessibilidade da web (WCAG 2.1 A e AA).
//
//   npm run test:a11y -w web                 tudo
//   npm run test:a11y -w web -- --only=axe   só uma parte: axe, keys, zoom ou offline
//   A11Y_OUT=<pasta> ...                     onde guardar capturas e relatório (padrão: pasta temporária)
//   A11Y_SKIP_BUILD=1 ...                    não recompila a web antes do teste do cartão offline
//
// Quatro partes:
//  1. axe: o axe-core nas 18 telas (páginas públicas, a ajuda antes e depois do pedido,
//     os disfarces, todas as abas do painel e a página de imprimir) em 390x844 (celular),
//     820x1180 (tablet) e 1440x900 (computador). Falha com violação das regras wcag2a,
//     wcag2aa, wcag21a e wcag21aa; as regras best-practice só avisam.
//  2. keys: uma rodada só com o teclado, na página dela e no painel (ver `keyboardFlow`).
//     A cada passo confere que o foco está num elemento visível, não coberto, com contorno
//     de foco, que a ordem do Tab segue a ordem visual e que nada prende o foco.
//  3. zoom: texto a 200% (fonte-raiz em 200%, o CSS usa rem) nas 18 telas em 390 px: nada
//     de texto cortado e nada de rolagem lateral. Também confere o espaçamento de texto do
//     WCAG 1.4.12. O zoom de 200% do navegador (viewport de 195 px) é do `test:reflow`.
//  4. offline: o cartão do balcão com a rede desligada, contra o servidor de verdade
//     (compila a web e sobe o servidor com banco em memória e dados de demonstração).
//
// Usa o Vite em modo mock (como o reflow-check) para as partes 1 a 3. Precisa de um
// chromium instalado pelo Playwright. Leitor de tela (NVDA, VoiceOver, TalkBack) não é
// coberto por este teste: o que ele garante são nomes, papéis e ordem, não a fala.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const webDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = join(webDir, '..');

const SIZES = [
  { name: 'celular', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'computador', width: 1440, height: 900 },
];
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const CODE = 'ESQBF7K2';
const SSID = 'Bar_do_Ze_Mezanino_Convidados_5GHz';
const WIFI_PASSWORD = 'senha-muito-longa-sem-espacos-1234567890123456';
const MENU_URL = 'https://cardapio.exemplo.com.br/bar-da-esquina/mesa/12345?utm_source=qr&utm_campaign=cardapio-digital';

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : ['axe', 'keys', 'zoom', 'offline'];
const OUT = process.env.A11Y_OUT || join(tmpdir(), 'nenm-a11y');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const failures = []; // { part, where, msg }
const warnings = []; // { part, where, msg }
const stats = { axeScreens: 0, keySteps: 0, zoomScreens: 0, offlineChecks: 0 };
const fail = (part, where, msg) => {
  failures.push({ part, where, msg });
  console.log(`  FALHA [${part}] ${where}: ${msg}`);
};
const warn = (part, where, msg) => warnings.push({ part, where, msg });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const shot = (page, name, fullPage = false) => page.screenshot({ path: join(OUT, name), fullPage }).catch(() => {});

// ------------------------------------------------------------------ as 18 telas

let base = '';

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(1000); // mock com latência simulada e animações de entrada
}

async function openHelp(page, root = base) {
  await page.goto(`${root}/q/${CODE}`);
  await page.getByRole('button', { name: /insegura/i }).waitFor({ timeout: 10000 });
}

async function loginByClick(panel) {
  await panel.goto(`${base}/painel`);
  await panel.getByRole('button', { name: /Preencher com a conta de teste/i }).click();
  await panel.getByRole('button', { name: /^Entrar$/ }).click();
  await panel.getByRole('link', { name: 'Cardápio e Wi-Fi' }).waitFor({ timeout: 10000 });
}

/** Cadastra o disfarce do Wi-Fi e o link do cardápio (mesmo caminho do reflow-check). */
async function configureCovers(panel) {
  await panel.goto(`${base}/painel/cardapio`);
  await panel.getByLabel('Nome da rede').fill(SSID);
  await panel.getByLabel(/^Senha/).fill(WIFI_PASSWORD);
  await panel.locator('form[aria-labelledby="wifi-title"] button[type="submit"]').click();
  await panel.getByText(/Wi-Fi.*salvo/i).first().waitFor({ timeout: 8000 }).catch(() => {});
  await panel.getByLabel(/^Link \(https/).fill(MENU_URL);
  await panel.locator('form[aria-labelledby="menu-link"] button[type="submit"]').click();
  await panel.getByText(/Link do cardápio salvo/i).waitFor({ timeout: 8000 }).catch(() => {});
}

/** Chama `onScreen(page, rótulo)` em cada uma das 18 telas, no tamanho dado. */
async function walkScreens(browser, size, onScreen) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'pt-BR', deviceScaleFactor: 1, bypassCSP: true });
  const page = await ctx.newPage();
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      fail('telas', `${label} @ ${size.width}px`, `não deu para abrir a tela (${String(e.message).split('\n')[0]})`);
    }
  };

  await step('/', async () => {
    await page.goto(`${base}/`);
    await settle(page);
    await onScreen(page, '/');
  });
  await step('/testar', async () => {
    await page.goto(`${base}/testar`);
    await settle(page);
    await onScreen(page, '/testar');
  });
  await step('/painel (login)', async () => {
    await page.goto(`${base}/painel`);
    await page.getByRole('button', { name: /Preencher com a conta de teste/i }).waitFor();
    await settle(page);
    await onScreen(page, '/painel (login)');
    await page.getByRole('button', { name: /Preencher com a conta de teste/i }).click();
    await onScreen(page, '/painel (login preenchido)');
  });
  await step('/q (antes do pedido)', async () => {
    await openHelp(page);
    await settle(page);
    await onScreen(page, `/q/${CODE} (antes do pedido)`);
  });

  const help = await ctx.newPage();
  await step('/q (depois do pedido)', async () => {
    await openHelp(help);
    await help.getByRole('button', { name: /Estou me sentindo insegura/i }).click();
    await help.getByText(/palavra-código|palavra código/i).first().waitFor({ timeout: 10000 });
    await settle(help);
    await onScreen(help, `/q/${CODE} (depois do pedido)`);
  });

  const panel = await ctx.newPage();
  let logged = false;
  await step('login gerência', async () => {
    await loginByClick(panel);
    logged = true;
  });

  if (logged) {
    const tab = (route, label) =>
      step(label, async () => {
        await panel.goto(`${base}${route}`);
        await panel.getByRole('link', { name: 'Cardápio e Wi-Fi' }).waitFor({ timeout: 10000 });
        await settle(panel);
        await onScreen(panel, label);
      });
    await tab('/painel', '/painel visão geral (com alerta novo)');
    await tab('/painel/alertas', '/painel/alertas');
    await tab('/painel/equipe', '/painel/equipe');
    await tab('/painel/qr-codes', '/painel/qr-codes');
    await tab('/painel/cardapio', '/painel/cardapio (vazio)');
    await tab('/painel/relatorio', '/painel/relatorio');
    await tab('/painel/qr-codes/imprimir', '/painel/qr-codes/imprimir');

    await step('/painel/cardapio (configurado)', async () => {
      await configureCovers(panel);
      await settle(panel);
      await onScreen(panel, '/painel/cardapio (com Wi-Fi e link)');
    });
    await step('/q (disfarces)', async () => {
      const p = await ctx.newPage();
      await openHelp(p);
      await settle(p);
      await onScreen(p, `/q/${CODE} (com Wi-Fi e link do cardápio)`);
      await p.getByRole('button', { name: /^Wi-Fi do local/ }).click();
      await p.getByRole('heading', { level: 1 }).first().waitFor();
      await settle(p);
      await onScreen(p, `/q/${CODE} (tela do Wi-Fi)`);
      await p.close();
    });
    await step('/q (cardápio em imagem)', async () => {
      await panel.goto(`${base}/painel/cardapio`);
      await panel.locator('#menu-upload').waitFor();
      const png = await panel.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 900;
        c.height = 1200;
        const g = c.getContext('2d');
        g.fillStyle = '#f4efe6';
        g.fillRect(0, 0, 900, 1200);
        g.fillStyle = '#222';
        g.font = '48px sans-serif';
        for (let i = 0; i < 10; i++) g.fillText(`Item ${i + 1} ........ R$ 25,00`, 60, 120 + i * 100);
        return c.toDataURL('image/png').split(',')[1];
      });
      await panel.locator('#menu-upload').setInputFiles({ name: 'cardapio.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await panel.getByText('Cardápio atualizado.').waitFor({ timeout: 15000 });
      await settle(panel);
      await onScreen(panel, '/painel/cardapio (com imagem)');
      const p = await ctx.newPage();
      await openHelp(p);
      await p.getByRole('button', { name: /^Ver cardápio/ }).click();
      await p.getByRole('heading', { level: 1 }).first().waitFor();
      await settle(p);
      await onScreen(p, `/q/${CODE} (tela do cardápio)`);
      await p.close();
    });
  }
  await ctx.close();
}

// ------------------------------------------------------------------------ 1. axe

const axeWarnings = new Map(); // regra -> { help, where: Set }
const axeReport = [];

async function runAxe(page, label, width) {
  const hasAxe = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (!hasAxe) await page.evaluate(axeSource);
  const res = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: [...tags, 'best-practice'] },
      resultTypes: ['violations', 'incomplete'],
    });
    const cut = (n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').trim() });
    const map = (v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags, nodes: v.nodes.slice(0, 4).map(cut), count: v.nodes.length });
    return { violations: r.violations.map(map), incomplete: r.incomplete.map(map) };
  }, WCAG_TAGS);
  stats.axeScreens += 1;
  const where = `${label} @ ${width}px`;
  let bad = 0;
  for (const v of res.violations) {
    const isWcag = v.tags.some((t) => WCAG_TAGS.includes(t));
    if (isWcag) {
      bad += 1;
      const sample = v.nodes.map((n) => `${n.target}`).join(' | ');
      fail('axe', where, `${v.id} (${v.impact}, ${v.count} elemento(s)): ${v.help}. ${sample}`);
      axeReport.push({ where, ...v });
    } else {
      const k = v.id;
      if (!axeWarnings.has(k)) axeWarnings.set(k, { help: v.help, where: new Set(), sample: v.nodes[0]?.target });
      axeWarnings.get(k).where.add(`${label} @ ${width}px`);
    }
  }
  const unsure = res.incomplete.filter((v) => v.id === 'color-contrast');
  if (unsure.length) warn('axe', where, `contraste não verificável pelo axe em ${unsure.reduce((n, v) => n + v.count, 0)} elemento(s) (sobre imagem ou gradiente)`);
  console.log(`${bad ? 'FALHA' : 'ok   '} axe ${String(width).padStart(4)}px  ${label}`);
  return bad;
}

async function partAxe(browser) {
  console.log('\n== 1. axe (WCAG 2.1 A e AA) nas 18 telas, três tamanhos ==');
  for (const size of SIZES) {
    await walkScreens(browser, size, async (page, label) => {
      await runAxe(page, label, size.width);
      if (label.startsWith('/painel visão geral')) await shot(page, `web-painel-visao-geral-${size.width}.png`, true);
    });
  }
}

// ------------------------------------------------------------------- 2. teclado

/** Roda dentro da página: descreve o elemento com foco e confere o contorno do anterior. */
function probeInPage() {
  const num = (s) => parseFloat(s) || 0;
  const hasRing = (cs) => cs.outlineStyle !== 'none' && num(cs.outlineWidth) > 0 && !/^rgba\(.*,\s*0\)$|\/\s*0\)$/.test(cs.outlineColor);
  const nameOf = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 70);
  const descOf = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${[...e.classList].slice(0, 2).map((c) => `.${c}`).join('')} "${nameOf(e)}"`;
  window.__a11yIds = window.__a11yIds || new WeakMap();
  window.__a11yNext = window.__a11yNext || 1;
  const uid = (e) => {
    if (!window.__a11yIds.has(e)) window.__a11yIds.set(e, window.__a11yNext++);
    return window.__a11yIds.get(e);
  };
  const el = document.activeElement;
  const out = { prev: null, body: false };
  const prev = window.__a11yPrev;
  if (prev && prev.el !== el && prev.el.isConnected) {
    const cs = getComputedStyle(prev.el);
    out.prev = { desc: prev.desc, ring: prev.ring, shadowChanged: prev.shadow !== cs.boxShadow };
  }
  if (!el || el === document.body || el === document.documentElement) {
    window.__a11yPrev = null;
    out.body = true;
    return out;
  }
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  let visible = r.width > 0 && r.height > 0;
  let fixed = false;
  for (let p = el; p; p = p.parentElement) {
    const c = getComputedStyle(p);
    if (c.display === 'none' || c.visibility === 'hidden' || num(c.opacity) === 0) visible = false;
    if (c.position === 'fixed' || c.position === 'sticky') fixed = true;
  }
  const inView = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const topEl = document.elementFromPoint(cx, cy);
  const occluded = !(topEl && (el.contains(topEl) || topEl.contains(el)));
  const tag = el.tagName.toLowerCase();
  let scroller = null;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const c = getComputedStyle(p);
    if ((c.overflowX === 'auto' || c.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) {
      scroller = uid(p);
      break;
    }
  }
  const control = (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) || el.getAttribute('role') === 'menuitem') && el.tabIndex >= 0;
  const sub = !!prev && prev.el === el; // campo de data: dia, mês, ano e o botão do calendário são paradas do mesmo elemento
  const ring = hasRing(cs);
  window.__a11yPrev = { el, desc: descOf(el), ring: ring || (sub && prev.ring), shadow: sub ? prev.shadow : cs.boxShadow };
  return {
    ...out,
    uid: uid(el),
    desc: descOf(el),
    name: nameOf(el),
    tag,
    id: el.id,
    role: el.getAttribute('role'),
    expanded: el.getAttribute('aria-expanded'),
    control,
    visible,
    inView,
    occluded,
    fixed,
    ring,
    shadow: cs.boxShadow,
    type: el.getAttribute('type'),
    sub,
    scroller,
    // Posição na página (não na janela): o navegador rola a tela a cada Tab.
    rect: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
  };
}

/** Roda dentro da página: todos os elementos que o Tab deveria alcançar. */
function tabbablesInPage() {
  window.__a11yIds = window.__a11yIds || new WeakMap();
  window.__a11yNext = window.__a11yNext || 1;
  const uid = (e) => {
    if (!window.__a11yIds.has(e)) window.__a11yIds.set(e, window.__a11yNext++);
    return window.__a11yIds.get(e);
  };
  const sel = 'a[href], button, input, select, textarea, summary, [tabindex]';
  const list = [];
  for (const e of document.querySelectorAll(sel)) {
    if (e.disabled || e.tabIndex < 0) continue;
    const closed = e.closest('details:not([open])');
    if (closed && !e.closest('summary')) continue; // conteúdo de <details> fechado não recebe foco
    let vis = true;
    for (let p = e; p; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden') vis = false;
    }
    const r = e.getBoundingClientRect();
    if (!vis || (r.width === 0 && r.height === 0)) continue;
    list.push({ uid: uid(e), desc: `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''} "${(e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"` });
  }
  return list;
}

class Keys {
  constructor(page, where) {
    this.page = page;
    this.where = where;
  }
  fail(msg) {
    fail('teclado', this.where, msg);
  }
  async press(key, ms = 130) {
    await this.page.keyboard.press(key);
    await sleep(ms);
  }
  /** Volta o ponto de partida do Tab para o começo da página. */
  async toTop() {
    // Tirar o foco e dar o foco ao body (por um instante) é o que recoloca o ponto de partida
    // do Tab no começo; só limpar a seleção não basta no Chromium.
    await this.page.evaluate(() => {
      document.activeElement?.blur?.();
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
      document.body.removeAttribute('tabindex');
      window.__a11yPrev = null;
      scrollTo(0, 0);
    });
  }
  async probe() {
    return this.page.evaluate(probeInPage);
  }
  /** Confere o foco atual: visível, dentro da tela, não coberto, com contorno. */
  judge(p, step) {
    stats.keySteps += 1;
    if (p.prev && !p.prev.ring && !p.prev.shadowChanged) {
      this.fail(`${step}: ${p.prev.desc} não mostra contorno de foco (sem outline e sem box-shadow diferente do estado sem foco)`);
    }
    if (p.body) return;
    if (!p.visible) this.fail(`${step}: o foco foi para um elemento invisível (${p.desc})`);
    else if (!p.inView) this.fail(`${step}: o foco foi para fora da tela (${p.desc})`);
    else if (p.occluded) this.fail(`${step}: o foco foi para um elemento coberto por outro (${p.desc})`);
    if (!p.sub && p.control && !p.ring && p.shadow === 'none') this.fail(`${step}: ${p.desc} sem contorno de foco`);
  }
  /** Aperta Tab até o teste passar (máximo `max` vezes), conferindo cada parada. */
  async tabUntil(test, step, max = 45) {
    for (let i = 0; i < max; i++) {
      await this.press('Tab');
      const p = await this.probe();
      this.judge(p, step);
      if (!p.body && test(p)) return p;
      if (p.body) break;
    }
    this.fail(`${step}: o Tab não chegou ao elemento esperado em ${max} toques`);
    return null;
  }
  /** Percorre a página inteira com Tab: alcança tudo, termina, na ordem visual. */
  async tabThrough(step, max = 120) {
    await this.toTop();
    const expected = await this.page.evaluate(tabbablesInPage);
    const seen = [];
    let ended = false;
    for (let i = 0; i < max; i++) {
      await this.press('Tab', 90);
      const p = await this.probe();
      this.judge(p, step);
      if (p.sub) continue; // outra parada do mesmo campo de data
      if (p.body || seen.some((s) => s.uid === p.uid)) {
        ended = true;
        break;
      }
      seen.push(p);
    }
    if (!ended) this.fail(`${step}: o Tab não terminou a página em ${max} toques (armadilha de foco?)`);
    const seenIds = new Set(seen.map((s) => s.uid));
    const missing = expected.filter((e) => !seenIds.has(e.uid));
    if (missing.length) this.fail(`${step}: o Tab não alcançou ${missing.map((m) => m.desc).join(', ')}`);
    const extra = seen.filter((s) => !expected.some((e) => e.uid === s.uid));
    if (extra.length) warn('teclado', this.where, `${step}: o Tab parou em ${extra.map((x) => x.desc).join(', ')}, que não estava na lista de tabuláveis`);
    // Ordem visual: o foco não sobe nem volta para a esquerda na mesma linha.
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i - 1];
      const b = seen[i];
      if (a.fixed || b.fixed) continue;
      if (a.scroller && a.scroller === b.scroller) continue; // numa barra que rola de lado a ordem é a do HTML
      const acy = a.rect.y + a.rect.h / 2;
      const bcy = b.rect.y + b.rect.h / 2;
      const sameRow = Math.abs(bcy - acy) <= Math.min(a.rect.h, b.rect.h) / 2;
      const nextColumn = b.rect.x >= a.rect.x + a.rect.w - 4; // grade: o cartão seguinte começa mais acima, na coluna ao lado
      if (bcy < acy - 10 && !sameRow && !nextColumn) this.fail(`${step}: ordem do Tab sobe na tela: ${a.desc} (y ${a.rect.y}) depois ${b.desc} (y ${b.rect.y})`);
      else if (sameRow && b.rect.x + b.rect.w / 2 < a.rect.x + a.rect.w / 2 - 4) this.fail(`${step}: ordem do Tab volta para a esquerda: ${a.desc} depois ${b.desc}`);
    }
    return seen;
  }
  async active() {
    return this.page.evaluate(() => {
      const e = document.activeElement;
      return { tag: e?.tagName.toLowerCase(), id: e?.id ?? '', role: e?.getAttribute('role'), text: (e?.innerText || e?.getAttribute('aria-label') || '').trim().slice(0, 60), connected: !!e?.isConnected, body: e === document.body };
    });
  }
  expect(cond, msg) {
    stats.keySteps += 1;
    if (!cond) this.fail(msg);
  }
}

async function keyboardFlow(browser, size) {
  const W = size.width;
  console.log(`-- teclado @ ${W}px`);
  const ctx = await browser.newContext({ viewport: { width: W, height: size.height }, locale: 'pt-BR', deviceScaleFactor: 1, bypassCSP: true });
  try {
    // ---- A. página dela, só com teclado
    const help = await ctx.newPage();
    const kh = new Keys(help, `página dela @ ${W}px`);
    await openHelp(help);
    await settle(help);
    let a = await kh.active();
    kh.expect(a.tag === 'h1', `ao abrir, o foco devia estar no título (h1), está em ${a.tag}`);
    await kh.tabThrough('Tab pela página dela');
    if (W === 390) await shot(help, `web-foco-pagina-dela-${W}.png`);

    await kh.toTop();
    const opt = await kh.tabUntil((p) => /insegura/i.test(p.name), 'Tab até a primeira opção');
    if (opt) {
      if (W === 390) await shot(help, `web-foco-opcao-${W}.png`);
      await kh.press('Enter', 100);
      await help.getByRole('heading', { level: 1, name: /Pedido enviado/ }).waitFor({ timeout: 8000 });
      await sleep(500);
      a = await kh.active();
      kh.expect(a.tag === 'h1', `depois do Enter na opção, o foco devia ir ao título do acompanhamento, está em ${a.tag} (${a.text})`);
      await kh.tabThrough('Tab pelo acompanhamento do pedido');
      await kh.toTop();
      const cancelBtn = await kh.tabUntil((p) => /Cancelar pedido/.test(p.name), 'Tab até "Cancelar pedido"');
      if (cancelBtn) {
        await kh.press('Enter', 300);
        a = await kh.active();
        kh.expect(a.id === 'help-confirm-title', `ao pedir para cancelar, o foco devia ir à pergunta de confirmação, está em ${a.tag}#${a.id}`);
        const yes = await kh.tabUntil((p) => /Sim, cancelar/.test(p.name), 'Tab até "Sim, cancelar"', 4);
        const no = yes && (await kh.tabUntil((p) => p.name === 'Não', 'Tab até "Não"', 3));
        if (no) {
          await kh.press('Enter', 400);
          a = await kh.active();
          kh.expect(/Cancelar pedido/.test(a.text), `depois de "Não", o foco devia voltar a "Cancelar pedido", está em ${a.tag} (${a.text})`);
        }
      }
    }
    await help.close();

    // ---- B. painel, só com teclado
    const panel = await ctx.newPage();
    const kp = new Keys(panel, `painel @ ${W}px`);
    await panel.goto(`${base}/painel`);
    await panel.getByRole('button', { name: /Preencher com a conta de teste/i }).waitFor();
    await settle(panel);
    const loginOrder = await kp.tabThrough('Tab pelo login');
    kp.expect(loginOrder.length === 4 && /E-mail|email/i.test(loginOrder[0].desc + loginOrder[0].tag) && loginOrder[0].tag === 'input' && loginOrder[1].tag === 'input' && /Entrar/.test(loginOrder[2].name), `ordem do login esperada: e-mail, senha, Entrar, conta de teste; veio ${loginOrder.map((x) => x.name || x.tag).join(' > ')}`);
    await kp.toTop();
    const demo = await kp.tabUntil((p) => /Preencher com a conta de teste/.test(p.name), 'Tab até a conta de teste');
    if (demo) {
      await kp.press('Enter', 200);
      await kp.toTop();
      await kp.tabUntil((p) => p.tag === 'input', 'Tab até o e-mail');
      const filled = await panel.evaluate(() => [document.getElementById('email').value, document.getElementById('password').value.length > 0]);
      kp.expect(filled[0] !== '' && filled[1], 'a conta de teste não preencheu e-mail e senha');
      // Digitar com o teclado, como quem não usa o botão de demonstração.
      await panel.keyboard.press('Control+A');
      await panel.keyboard.type(filled[0]);
      await kp.press('Tab');
      await kp.tabUntil((p) => /^Entrar$/.test(p.name), 'Tab até "Entrar"', 3);
      await kp.press('Enter', 100);
      await panel.getByRole('link', { name: 'Cardápio e Wi-Fi' }).waitFor({ timeout: 10000 });
      await settle(panel);
    }

    // pular para o conteúdo
    await kp.toTop();
    const skip = await kp.tabUntil((p) => /Pular para o conteúdo/.test(p.name), 'Tab até "Pular para o conteúdo"', 2);
    if (skip) {
      kp.expect(skip.visible && skip.inView, 'o link "Pular para o conteúdo" não aparece quando recebe o foco');
      if (W === 1440) await shot(panel, `web-foco-painel-pular-${W}.png`);
      await kp.press('Enter', 200);
      a = await kp.active();
      kp.expect(a.id === 'conteudo', `"Pular para o conteúdo" devia levar o foco ao #conteudo, está em ${a.tag}#${a.id}`);
      await kp.press('Tab');
      const afterSkip = await kp.probe();
      const insideMain = await panel.evaluate(() => !!document.activeElement?.closest('#conteudo'));
      kp.expect(afterSkip.body || insideMain, `depois de pular, o Tab devia seguir dentro do conteúdo, parou em ${afterSkip.desc}`);
    }

    // página inteira: ordem, contorno, sem armadilha (visão geral com alerta novo)
    await kp.tabThrough('Tab pela visão geral do painel');
    if (W === 1440) await shot(panel, `web-foco-painel-${W}.png`);

    // abas
    const routes = [
      ['Alertas', '/painel/alertas'],
      ['Equipe', '/painel/equipe'],
      ['QR codes', '/painel/qr-codes'],
      ['Cardápio e Wi-Fi', '/painel/cardapio'],
      ['Relatório do mês', '/painel/relatorio'],
      ['Visão geral', '/painel'],
    ];
    for (const [name, path] of routes) {
      await kp.toTop();
      const link = await kp.tabUntil((p) => p.tag === 'a' && p.name === name, `Tab até a aba "${name}"`, 14);
      if (!link) continue;
      await kp.press('Enter', 500);
      kp.expect(new URL(panel.url()).pathname === path, `Enter na aba "${name}" devia ir a ${path}, está em ${new URL(panel.url()).pathname}`);
      const h1 = await panel.getByRole('heading', { level: 1 }).count();
      kp.expect(h1 > 0, `a aba "${name}" ficou sem título h1`);
      if (name !== 'Visão geral') await kp.tabThrough(`Tab pela aba "${name}"`);
    }
    await settle(panel);

    // quadro ao vivo: menus
    await kp.toTop();
    const mandar = await kp.tabUntil((p) => /^Mandar alguém/.test(p.name), 'Tab até "Mandar alguém"', 30);
    if (mandar) {
      await kp.press('Enter', 200);
      let s = await panel.evaluate(() => ({ menu: !!document.querySelector('[role="menu"]'), role: document.activeElement?.getAttribute('role'), first: document.activeElement?.innerText.trim().slice(0, 30), items: document.querySelectorAll('[role="menuitem"]').length }));
      kp.expect(s.menu && s.role === 'menuitem', `Enter em "Mandar alguém" devia abrir a lista com o foco no primeiro item (menu ${s.menu}, foco ${s.role})`);
      if (s.menu) {
        await shot(panel, `web-foco-menu-${W}.png`);
        await runAxe(panel, 'painel com o menu "Mandar alguém" aberto', W);
        const probes = [];
        if (s.items >= 2) {
          await kp.press('ArrowDown');
          probes.push(await kp.probe());
          const second = (await kp.active()).text;
          kp.expect(second !== s.first, 'seta para baixo não andou para o segundo item');
          await kp.press('End');
          const last = await kp.probe();
          await kp.press('Home');
          const home = await kp.probe();
          kp.expect(home.name === s.first.replace(/\s+/g, ' '), `Home devia voltar ao primeiro item (${s.first}), foi para ${home.name}`);
          kp.expect(last.name !== home.name || s.items === 1, 'End não foi ao último item');
          for (const p of [...probes, last, home]) kp.judge(p, 'foco nos itens do menu');
        }
        await kp.press('Escape');
        s = await panel.evaluate(() => ({ menu: !!document.querySelector('[role="menu"]'), label: document.activeElement?.getAttribute('aria-label'), expanded: document.activeElement?.getAttribute('aria-expanded') }));
        kp.expect(!s.menu && /^Mandar alguém/.test(s.label || '') && s.expanded === 'false', `Esc devia fechar a lista e devolver o foco a "Mandar alguém" (lista aberta ${s.menu}, foco em ${s.label})`);
        // espaço abre; seta para cima abre na última; Tab para fora fecha sem prender
        await kp.press('Space', 200);
        s = await panel.evaluate(() => !!document.querySelector('[role="menu"]'));
        kp.expect(s, 'a barra de espaço em "Mandar alguém" não abriu a lista');
        await kp.press('Escape');
        await kp.press('ArrowUp', 200);
        s = await panel.evaluate(() => ({ menu: !!document.querySelector('[role="menu"]'), role: document.activeElement?.getAttribute('role') }));
        kp.expect(s.menu && s.role === 'menuitem', 'seta para cima em "Mandar alguém" devia abrir a lista no último item');
        await kp.press('Tab', 200);
        const out = await panel.evaluate(() => ({ menu: !!document.querySelector('[role="menu"]'), inMenu: !!document.activeElement?.closest('[role="menu"]'), name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.innerText?.trim().slice(0, 40) }));
        kp.expect(!out.menu && !out.inMenu, `Tab no último item devia sair e fechar a lista (lista aberta ${out.menu}, foco em ${out.name})`);
      }
    }
    // "Encerrar": abre, anda, Esc
    await kp.toTop();
    const enc = await kp.tabUntil((p) => /^Encerrar o alerta/.test(p.name), 'Tab até "Encerrar"', 30);
    if (enc) {
      await kp.press('Enter', 200);
      await kp.press('ArrowDown');
      await kp.press('ArrowDown');
      const inList = await panel.evaluate(() => document.activeElement?.getAttribute('role'));
      kp.expect(inList === 'menuitem', 'as setas em "Encerrar" não andaram pelos desfechos');
      await kp.press('Escape');
      const back = await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      kp.expect(/^Encerrar o alerta/.test(back || ''), `Esc em "Encerrar" devia devolver o foco ao botão, está em ${back}`);
    }
    // executar ações: "Vi o alerta", mandar alguém (Enter no item), encerrar (Enter no item)
    await kp.toTop();
    const vi = await kp.tabUntil((p) => /^Vi o alerta/.test(p.name), 'Tab até "Vi o alerta"', 30);
    if (vi) {
      await kp.press('Enter', 100);
      await panel.getByText(/marcado como visto/).first().waitFor({ timeout: 6000 }).catch(() => kp.fail('"Vi o alerta" com Enter não marcou o alerta como visto'));
      await sleep(300);
      a = await kp.active();
      kp.expect(a.connected && !a.body, 'depois de "Vi o alerta" o foco se perdeu (está no body)');
    }
    await kp.toTop();
    const m2 = await kp.tabUntil((p) => /^Mandar alguém/.test(p.name), 'Tab até "Mandar alguém" (2)', 30);
    if (m2) {
      await kp.press('Enter', 200);
      await kp.press('Enter', 100);
      await panel.getByText(/Aviso enviado a .+ no app/).first().waitFor({ timeout: 6000 }).catch(() => kp.fail('Enter num nome do menu "Mandar alguém" não mandou ninguém'));
      await sleep(300);
      a = await kp.active();
      kp.expect(a.connected && !a.body, 'depois de mandar alguém o foco se perdeu (está no body)');
    }
    await kp.toTop();
    const e2 = await kp.tabUntil((p) => /^Encerrar o alerta/.test(p.name), 'Tab até "Encerrar" (2)', 30);
    if (e2) {
      await kp.press('Enter', 200);
      await kp.press('Enter', 100);
      await panel.getByText(/Nenhum alerta em aberto/).waitFor({ timeout: 6000 }).catch(() => kp.fail('Enter num desfecho do menu "Encerrar" não encerrou o alerta'));
      await sleep(300);
      a = await kp.active();
      kp.expect(a.connected && !a.body, 'depois de encerrar o alerta o foco se perdeu (está no body)');
    }

    // ---- C. disfarces: Tab até o botão, Enter, Voltar; Esc esconde
    await configureCovers(panel);
    const h2 = await ctx.newPage();
    const kc = new Keys(h2, `disfarces @ ${W}px`);
    await openHelp(h2);
    await settle(h2);
    await kc.tabThrough('Tab pela página dela com disfarces');
    await kc.toTop();
    const wifiBtn = await kc.tabUntil((p) => /^Wi-Fi do local/.test(p.name), 'Tab até "Wi-Fi do local"', 6);
    if (wifiBtn) {
      await kc.press('Enter', 300);
      const title = await h2.getByRole('heading', { level: 1 }).first().innerText();
      kc.expect(!/Precisa de ajuda/.test(title), 'Enter em "Wi-Fi do local" não trocou a tela');
      await kc.tabThrough('Tab pela tela do Wi-Fi');
      await kc.toTop();
      const back = await kc.tabUntil((p) => /^Voltar/.test(p.name), 'Tab até "Voltar"', 8);
      if (back) {
        await kc.press('Enter', 300);
        const t2 = await h2.getByRole('heading', { level: 1 }).first().innerText();
        kc.expect(/Precisa de ajuda/.test(t2), 'Enter em "Voltar" não devolveu a página de ajuda');
      }
    }
    await kc.press('Escape', 300);
    const tEsc = await h2.getByRole('heading', { level: 1 }).first().innerText().catch(() => '');
    kc.expect(!/Precisa de ajuda/.test(tEsc), 'Esc não escondeu a página de ajuda (disfarce)');
    await h2.close();
    await panel.close();
  } finally {
    await ctx.close();
  }
}

async function partKeys(browser) {
  console.log('\n== 2. só teclado: página dela e painel ==');
  for (const size of [SIZES[0], SIZES[2]]) {
    try {
      await keyboardFlow(browser, size);
    } catch (e) {
      fail('teclado', `rodada @ ${size.width}px`, `a rodada parou: ${String(e.message).split('\n')[0]}`);
    }
  }
}

// ------------------------------------------------------------ 3. texto a 200%

/** Roda dentro da página: texto cortado e rolagem lateral. */
function inspectCutInPage() {
  const root = document.documentElement;
  const out = { sw: root.scrollWidth, cw: root.clientWidth, cut: [] };
  const short = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += `.${cls.join('.')}`;
    return s;
  };
  const clips = (v) => v === 'hidden' || v === 'clip';
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.visually-hidden') || el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const text = (el.innerText || '').trim();
    if (!text) continue;
    if (clips(cs.overflowY) && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) out.cut.push({ el: short(el), why: `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}`, text: text.slice(0, 40) });
    if (clips(cs.overflowX) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.cut.push({ el: short(el), why: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`, text: text.slice(0, 40) });
  }
  // Texto cujo retângulo sai da caixa de um ancestral que recorta.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('.visually-hidden') || el.closest('svg') || el.closest('script,style')) continue;
    const ecs = getComputedStyle(el);
    if (ecs.display === 'none' || ecs.visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (!clips(cs.overflowX) && !clips(cs.overflowY)) continue;
      const b = p.getBoundingClientRect();
      const bad = rects.find((r) => (clips(cs.overflowY) && (r.bottom > b.bottom + 1 || r.top < b.top - 1)) || (clips(cs.overflowX) && (r.right > b.right + 1 || r.left < b.left - 1)));
      if (bad) {
        out.cut.push({ el: short(el), why: `texto fora da caixa de ${short(p)} (texto ${Math.round(bad.top)}-${Math.round(bad.bottom)}, caixa ${Math.round(b.top)}-${Math.round(b.bottom)})`, text: n.nodeValue.trim().slice(0, 40) });
        break;
      }
    }
  }
  return out;
}

const TEXT_SPACING_CSS = '*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important}p{margin-bottom:2em !important}';

async function partZoom(browser) {
  console.log('\n== 3. texto a 200% (fonte-raiz) e espaçamento de texto, 390 px ==');
  const size = SIZES[0];
  const run = (mode) =>
    walkScreens(browser, size, async (page, label) => {
      if (mode === 'zoom') await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      else await page.addStyleTag({ content: TEXT_SPACING_CSS });
      await sleep(500);
      const m = await page.evaluate(inspectCutInPage);
      stats.zoomScreens += 1;
      const where = `${label} @ ${size.width}px, ${mode === 'zoom' ? 'texto a 200%' : 'espaçamento WCAG 1.4.12'}`;
      let bad = false;
      if (m.sw > m.cw + 1) {
        bad = true;
        fail('zoom', where, `rola de lado: scrollWidth ${m.sw} > clientWidth ${m.cw}`);
      }
      const seen = new Set();
      for (const c of m.cut) {
        const k = `${c.el}|${c.why}`;
        if (seen.has(k)) continue;
        seen.add(k);
        bad = true;
        fail('zoom', where, `texto cortado em ${c.el} (${c.why}): "${c.text}"`);
      }
      if (mode === 'zoom' && /\(antes do pedido\)$/.test(label)) await shot(page, `web-pagina-dela-200.png`, true);
      if (mode === 'zoom' && /\(depois do pedido\)$/.test(label)) await shot(page, `web-pagina-dela-acompanhamento-200.png`, true);
      console.log(`${bad ? 'FALHA' : 'ok   '} ${mode === 'zoom' ? '200%' : '1.4.12'}  ${label}`);
    });
  await run('zoom');
  await run('spacing');
}

// ------------------------------------------------------------ 4. cartão offline

function runSync(command, cwd) {
  // O servidor de desenvolvimento do Vite (partes 1 a 3) deixa neste processo VITE_DATA_SOURCE=mock e
  // NODE_ENV=development. A web que o servidor de verdade serve tem de ser a de produção, com a camada
  // de dados da API (e com o service worker, que só se registra em produção).
  return spawnSync(command, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, VITE_DATA_SOURCE: 'api', NODE_ENV: 'production' } });
}

async function startRealServer() {
  if (!process.env.A11Y_SKIP_BUILD) {
    console.log('Compilando a web (npm run build -w web)...');
    const b = runSync('npm run build -w web', repoDir);
    if (b.status !== 0) throw new Error(`build da web falhou:\n${(b.stdout || '') + (b.stderr || '')}`.slice(-1500));
  }
  const port = await freePort();
  const child = spawn('npx tsx src/index.ts', {
    cwd: join(repoDir, 'server'),
    shell: true,
    env: { ...process.env, PORT: String(port), PGLITE_DIR: 'memory', SEED_DEMO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://localhost:${port}`;
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) break;
    } catch {
      // ainda subindo
    }
    if (Date.now() - t0 > 60000) {
      stopServer(child);
      throw new Error(`o servidor não subiu em 60 s:\n${log.slice(-1200)}`);
    }
    await sleep(500);
  }
  return { child, url };
}

function stopServer(child) {
  if (!child || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function partOffline(browser) {
  console.log('\n== 4. cartão do balcão com a rede desligada (servidor de verdade) ==');
  let server;
  try {
    server = await startRealServer();
    const root = server.url;
    console.log(`Servidor de verdade: ${root}`);
    const where = 'cartão do balcão';
    const check = (cond, msg) => {
      stats.offlineChecks += 1;
      if (!cond) fail('offline', where, msg);
    };
    const cardShown = async (page, ms = 6000) => {
      try {
        await page.getByRole('heading', { level: 1, name: /Mostre esta tela/ }).waitFor({ timeout: ms });
        return true;
      } catch {
        return false;
      }
    };

    console.log('  (a) cartão com a rede desligada depois de carregar');
    // (a) carrega com rede, desliga, toca numa opção
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', bypassCSP: true });
    const page = await ctx.newPage();
    await openHelp(page, root);
    await page.getByRole('heading', { level: 1, name: /Precisa de ajuda/ }).waitFor();
    await ctx.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false, null, { timeout: 5000 }).catch(() => {});
    for (const kind of ['insegura', 'sair daqui', 'falar com alguém']) {
      await page.getByRole('button', { name: new RegExp(kind, 'i') }).click();
      const ok = await cardShown(page);
      check(ok, `com a rede desligada, tocar em "${kind}" não mostrou o cartão para levar ao balcão`);
      if (ok) {
        const t = await page.locator('main').innerText();
        check(/PEDIDO DE AJUDA/.test(t), `o cartão não traz "PEDIDO DE AJUDA" (opção ${kind})`);
        check(/Local: Banheiro feminino/.test(t), `o cartão não traz o local (opção ${kind}): ${t.slice(0, 120).replace(/\s+/g, ' ')}`);
        check(/Palavra-código:\s*\S+/.test(t), `o cartão não traz a palavra-código (opção ${kind})`);
        check(/Sem conexão no momento/.test(t), `o cartão não explica que está sem conexão (opção ${kind})`);
        check((await page.locator('a[href="tel:190"]').count()) === 1 && (await page.locator('a[href="tel:180"]').count()) === 1, 'o cartão perdeu os telefones 190 e 180');
        const focusOnTitle = await page.evaluate(() => document.activeElement?.tagName === 'H1');
        check(focusOnTitle, 'o foco não foi ao título do cartão');
        if (kind === 'insegura') {
          await shot(page, 'web-cartao-balcao-offline-390.png');
          for (const size of SIZES) {
            await page.setViewportSize({ width: size.width, height: size.height });
            await sleep(300);
            if (size.width === 1440) await shot(page, 'web-cartao-balcao-offline-1440.png');
            await runAxe(page, '/q (cartão do balcão, rede desligada)', size.width);
            const m = await page.evaluate(inspectCutInPage);
            check(m.sw <= m.cw + 1, `o cartão rola de lado @ ${size.width}px`);
          }
          await page.setViewportSize({ width: 390, height: 844 });
        }
        await page.getByRole('button', { name: /Tentar enviar de novo/ }).click();
        await page.getByRole('heading', { level: 1, name: /Precisa de ajuda/ }).waitFor({ timeout: 4000 }).catch(() => check(false, 'o botão "Tentar enviar de novo" não voltou às opções'));
      }
    }
    // religa a rede: o pedido sai de verdade
    await ctx.setOffline(false);
    await page.waitForFunction(() => navigator.onLine === true, null, { timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /insegura/i }).click();
    const sent = await page.getByRole('heading', { level: 1, name: /Pedido enviado/ }).waitFor({ timeout: 8000 }).then(() => true, () => false);
    check(sent, 'com a rede de volta, o pedido não saiu');
    if (sent) {
      await page.getByRole('button', { name: /Cancelar pedido/ }).click();
      await page.getByRole('button', { name: /Sim, cancelar/ }).click();
      await sleep(500);
    }

    // (b) Limite conhecido, de propósito: abrir a página já sem conexão não funciona. A página dela não
    // instala service worker nem guarda nada no celular além do próprio pedido (sessionStorage), então
    // quem está sem sinal ao ler o QR code não chega ao cartão. Aqui só se confere que nada abre offline.
    console.log('  (b) abrir a página já offline: não abre (limite conhecido, sem service worker)');
    await ctx.setOffline(true);
    const again = await ctx.newPage();
    const opened = await again.goto(`${root}/q/${CODE}`, { timeout: 8000 }).then(() => true, () => false);
    check(!opened, 'a página abriu offline: há um service worker ou cache que não devia existir');
    check((await page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0))) === 0, 'a página registrou um service worker');
    await again.close();
    await ctx.close();

    console.log('  (c) API inalcançável ao abrir');
    // (c) a página abre (já estava no navegador), mas o servidor não responde: o cartão sai sozinho
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', bypassCSP: true });
    const p2 = await ctx2.newPage();
    await p2.route('**/api/**', (r) => r.abort('connectionrefused'));
    await p2.goto(`${root}/q/${CODE}`);
    const auto = await cardShown(p2, 8000);
    check(auto, 'com a API inalcançável ao abrir, a página não mostrou o cartão do balcão');
    if (auto) {
      const t = await p2.locator('main').innerText();
      check(/Sem conexão no momento/.test(t) && /Palavra-código/.test(t), 'o cartão aberto sem a API não traz o aviso e a palavra-código');
      check(!(await p2.evaluate(() => document.title === 'Carregando…')), 'sem a API o título da aba ficou em "Carregando…"');
      check(!/Local:/.test(t), 'sem a API o cartão não devia inventar o local');
      await shot(p2, 'web-cartao-balcao-sem-api-390.png');
    }
    await ctx2.close();

    console.log('  (d) erro 500 ao pedir');
    // (d) servidor devolve erro 500 ao pedir: cartão com "Não foi possível enviar o pedido."
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', bypassCSP: true });
    const p3 = await ctx3.newPage();
    await openHelp(p3, root);
    await p3.route('**/api/public/**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }) : r.fallback()));
    await p3.route('**/api/alerts', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }) : r.fallback()));
    await p3.getByRole('button', { name: /insegura/i }).click();
    check(await cardShown(p3, 8000), 'com erro 500 ao pedir, a página não mostrou o cartão do balcão');
    await ctx3.close();
  } catch (e) {
    fail('offline', 'cartão do balcão', `a parte parou: ${String(e.message).split('\n').slice(0, 6).join(' | ')}`);
  } finally {
    stopServer(server?.child);
  }
}

// ---------------------------------------------------------------------- principal

let vite;
let browser;
try {
  if (only.some((p) => ['axe', 'keys', 'zoom'].includes(p))) {
    process.env.VITE_DATA_SOURCE = 'mock';
    const port = await freePort();
    base = `http://localhost:${port}`;
    vite = await createServer({ root: webDir, logLevel: 'error', server: { port, strictPort: true, host: 'localhost' } });
    await vite.listen();
    console.log(`Vite em modo mock: ${base}`);
  }
  browser = await chromium.launch();
  if (vite) {
    const warm = await browser.newPage();
    await warm.goto(`${base}/`);
    await warm.waitForLoadState('networkidle');
    await warm.close();
  }
  // Cada parte tem um prazo: uma espera sem fim vira falha em vez de travar o teste.
  const guarded = (name, ms, fn) =>
    Promise.race([
      fn(browser),
      new Promise((resolve) =>
        setTimeout(() => {
          fail(name, 'prazo', `a parte passou de ${Math.round(ms / 60000)} minutos e foi abandonada`);
          resolve();
        }, ms).unref(),
      ),
    ]);
  if (only.includes('axe')) await guarded('axe', 15 * 60000, partAxe);
  if (only.includes('keys')) await guarded('teclado', 10 * 60000, partKeys);
  if (only.includes('zoom')) await guarded('zoom', 10 * 60000, partZoom);
  if (only.includes('offline')) await guarded('offline', 4 * 60000, partOffline);
} finally {
  await browser?.close().catch(() => {});
  await vite?.close().catch(() => {});
}

console.log('\n================ resumo ================');
if (axeWarnings.size) {
  console.log('Avisos (best-practice, não falham):');
  for (const [id, w] of axeWarnings) console.log(`  - ${id}: ${w.help} (${w.where.size} tela(s)/tamanho(s); ex.: ${w.sample})`);
}
for (const w of warnings.slice(0, 20)) console.log(`  aviso [${w.part}] ${w.where}: ${w.msg}`);
writeFileSync(join(OUT, 'a11y-report.json'), JSON.stringify({ stats, failures, warnings, axeWarnings: [...axeWarnings].map(([id, w]) => ({ id, help: w.help, where: [...w.where] })), axeViolations: axeReport }, null, 2));
console.log(`Capturas e relatório: ${OUT}`);
console.log(`Verificações: axe ${stats.axeScreens} telas/tamanhos, teclado ${stats.keySteps} passos, texto ampliado ${stats.zoomScreens} telas, offline ${stats.offlineChecks} conferências.`);
if (failures.length > 0) {
  console.log(`\n${failures.length} falha(s):`);
  for (const f of failures) console.log(`  - [${f.part}] ${f.where}: ${f.msg}`);
  process.exit(1);
}
console.log('Acessibilidade ok: sem violação A ou AA, teclado, texto a 200% e cartão offline conferidos.');
