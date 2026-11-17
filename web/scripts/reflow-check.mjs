// Verificador de reflow (WCAG 1.4.10): a página não pode rolar para o lado.
//
//   npm run test:reflow -w web
//
// Sobe o Vite em modo mock (dados simulados no navegador, sem servidor), abre
// cada tela em 195, 260, 320, 390 e 1440 px de largura (195 px é um celular de
// 390 px com zoom de 200%) e falha se `scrollWidth` passar de `clientWidth`.
// Também falha se uma das três opções da ajuda ficar com menos de 72 px de
// altura a partir de 320 px. Precisa de um chromium instalado pelo Playwright
// (não entra no `npm test` da raiz por isso).
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const WIDTHS = [195, 260, 320, 390, 1440];
const MIN_OPTION_HEIGHT = 72;
const MIN_OPTION_WIDTH = 320; // abaixo disso a opção pode quebrar linha e crescer, mas nunca encolher
const CODE = 'ESQBF7K2';
const SSID = 'Bar_do_Ze_Mezanino_Convidados_5GHz';
const WIFI_PASSWORD = 'senha-muito-longa-sem-espacos-1234567890123456';
const MENU_URL = 'https://cardapio.exemplo.com.br/bar-da-esquina/mesa/12345?utm_source=qr&utm_campaign=cardapio-digital';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Roda dentro da página: lista os elementos que passam da borda direita e não estão dentro de uma caixa que rola. */
function inspectPage() {
  const root = document.documentElement;
  const cw = root.clientWidth;
  const sw = root.scrollWidth;
  const short = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += `.${cls.join('.')}`;
    return s;
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= cw + 1) continue;
    // Elemento fixo não aumenta a rolagem da página; quem está dentro de uma caixa com rolagem própria rola ali.
    let skip = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.position === 'fixed') skip = true;
      if (p !== el && pcs.overflowX !== 'visible') skip = true;
    }
    if (skip) continue;
    offenders.push({ el: short(el), width: Math.round(r.width), right: Math.round(r.right) });
  }
  offenders.sort((a, b) => b.width - a.width);
  const heights = [...document.querySelectorAll('.help-option')].map((o) => Math.round(o.getBoundingClientRect().height));
  return { cw, sw, offenders: offenders.slice(0, 5), heights };
}

const failures = [];
let combos = 0;

/** Mede a tela atual e registra as falhas. */
async function measure(page, label, width) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(700); // mock com latência simulada e transições
  const m = await page.evaluate(inspectPage);
  combos += 1;
  if (m.sw > m.cw + 1) {
    const list = m.offenders.length ? m.offenders.map((o) => `${o.el} ${o.width}px (borda direita em ${o.right}px)`).join('; ') : 'nenhum elemento identificado';
    failures.push(`${label} @ ${width}px: scrollWidth ${m.sw} > clientWidth ${m.cw}. Mais largos: ${list}`);
  }
  if (width >= MIN_OPTION_WIDTH && m.heights.length > 0) {
    const low = m.heights.filter((h) => h < MIN_OPTION_HEIGHT);
    if (low.length > 0) failures.push(`${label} @ ${width}px: .help-option com altura ${m.heights.join(', ')} px (mínimo ${MIN_OPTION_HEIGHT})`);
  }
  const mark = m.sw > m.cw + 1 ? 'FALHA' : 'ok   ';
  console.log(`${mark} ${String(width).padStart(4)}px  ${label}  (scrollWidth ${m.sw}, clientWidth ${m.cw})`);
}

async function step(label, width, fn) {
  try {
    await fn();
  } catch (e) {
    combos += 1;
    failures.push(`${label} @ ${width}px: não deu para abrir a tela (${String(e.message).split('\n')[0]})`);
    console.log(`FALHA ${String(width).padStart(4)}px  ${label}  (erro: ${String(e.message).split('\n')[0]})`);
  }
}

async function login(panel) {
  await panel.goto(`${base}/painel`);
  await panel.getByRole('button', { name: /Preencher com a conta de teste/i }).click();
  await panel.getByRole('button', { name: /^Entrar$/ }).click();
  await panel.getByRole('link', { name: 'Cardápio e Wi-Fi' }).waitFor({ timeout: 10000 });
}

async function openHelp(page) {
  await page.goto(`${base}/q/${CODE}`);
  await page.getByRole('button', { name: /insegura/i }).waitFor({ timeout: 10000 });
}

async function runWidth(browser, width) {
  const height = width >= 1000 ? 900 : 844;
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  await step('/', width, async () => {
    await page.goto(`${base}/`);
    await measure(page, '/', width);
  });
  await step('/testar', width, async () => {
    await page.goto(`${base}/testar`);
    await measure(page, '/testar', width);
  });
  await step('/painel (login)', width, async () => {
    await page.goto(`${base}/painel`);
    await page.getByRole('button', { name: /Preencher com a conta de teste/i }).waitFor();
    await measure(page, '/painel (login)', width);
    await page.getByRole('button', { name: /Preencher com a conta de teste/i }).click();
    await measure(page, '/painel (login preenchido)', width);
  });
  await step('/q (antes do pedido)', width, async () => {
    await openHelp(page);
    await measure(page, `/q/${CODE} (antes do pedido)`, width);
  });

  // Depois do pedido: o alerta fica aberto nesta aba; o painel o recebe pelo mock (localStorage e BroadcastChannel).
  const help = await ctx.newPage();
  await step('/q (depois do pedido)', width, async () => {
    await openHelp(help);
    await help.getByRole('button', { name: /Estou me sentindo insegura/i }).click();
    await help.getByText(/palavra-código|palavra código/i).first().waitFor({ timeout: 10000 });
    await measure(help, `/q/${CODE} (depois do pedido)`, width);
  });

  const panel = await ctx.newPage();
  let logged = false;
  await step('login gerência', width, async () => {
    await login(panel);
    logged = true;
  });

  if (logged) {
    const tab = (route, label) =>
      step(label, width, async () => {
        await panel.goto(`${base}${route}`);
        await panel.getByRole('link', { name: 'Cardápio e Wi-Fi' }).waitFor({ timeout: 10000 });
        await measure(panel, label, width);
      });
    await tab('/painel', '/painel visão geral (com alerta novo)');
    await tab('/painel/alertas', '/painel/alertas');
    await tab('/painel/equipe', '/painel/equipe');
    await tab('/painel/qr-codes', '/painel/qr-codes');
    await tab('/painel/cardapio', '/painel/cardapio (vazio)');
    await tab('/painel/relatorio', '/painel/relatorio');
    await tab('/painel/qr-codes/imprimir', '/painel/qr-codes/imprimir');

    // Cadastra o disfarce do Wi-Fi e o link do cardápio, depois confere a página de ajuda com eles.
    await step('/painel/cardapio (configurado)', width, async () => {
      await panel.goto(`${base}/painel/cardapio`);
      await panel.getByLabel('Nome da rede').fill(SSID);
      await panel.getByLabel(/^Senha/).fill(WIFI_PASSWORD);
      await panel.locator('form[aria-labelledby="wifi-title"] button[type="submit"]').click();
      await panel.getByText(/Wi-Fi.*salvo/i).first().waitFor({ timeout: 8000 }).catch(() => {});
      await panel.getByLabel(/^Link \(https/).fill(MENU_URL);
      await panel.locator('form[aria-labelledby="menu-link"] button[type="submit"]').click();
      await panel.getByText(/Link do cardápio salvo/i).waitFor({ timeout: 8000 }).catch(() => {});
      await measure(panel, '/painel/cardapio (com Wi-Fi e link)', width);
    });
    await step('/q (disfarces)', width, async () => {
      const p = await ctx.newPage();
      await openHelp(p);
      await measure(p, `/q/${CODE} (com Wi-Fi e link do cardápio)`, width);
      await p.getByRole('button', { name: /^Wi-Fi do local/ }).click();
      await p.getByRole('heading', { level: 1 }).first().waitFor();
      await measure(p, `/q/${CODE} (tela do Wi-Fi)`, width);
      await p.close();
    });
    await step('/q (cardápio em imagem)', width, async () => {
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
      await measure(panel, '/painel/cardapio (com imagem)', width);
      const p = await ctx.newPage();
      await openHelp(p);
      await p.getByRole('button', { name: /^Ver cardápio/ }).click();
      await p.getByRole('heading', { level: 1 }).first().waitFor();
      await measure(p, `/q/${CODE} (tela do cardápio)`, width);
      await p.close();
    });
  }
  await ctx.close();
}

// ---- servidor e navegador ----
process.env.VITE_DATA_SOURCE = 'mock';
const webDir = fileURLToPath(new URL('..', import.meta.url));
const port = await freePort();
const base = `http://localhost:${port}`;
const server = await createServer({ root: webDir, logLevel: 'error', server: { port, strictPort: true, host: 'localhost' } });
let browser;
try {
  await server.listen();
  console.log(`Vite em modo mock: ${base}`);
  browser = await chromium.launch();
  // Aquece o Vite (otimização de dependências) antes das medições.
  const warm = await browser.newPage();
  await warm.goto(`${base}/`);
  await warm.waitForLoadState('networkidle');
  await warm.close();
  for (const w of WIDTHS) await runWidth(browser, w);
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}

console.log('');
if (failures.length > 0) {
  console.log(`${failures.length} falha(s) em ${combos} verificações:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`Reflow ok: ${combos} verificações (${WIDTHS.join(', ')} px), sem rolagem lateral e com opções da ajuda de ${MIN_OPTION_HEIGHT} px ou mais.`);
