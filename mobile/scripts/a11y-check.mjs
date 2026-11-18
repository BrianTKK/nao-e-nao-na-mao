// Conferência de acessibilidade do app da equipe, de ponta a ponta, no app aberto no
// navegador (Expo web) contra um servidor de verdade. Roda o axe em cada tela e
// estado, confere rótulos e regiões vivas, simula fonte grande e confere o
// "Reduzir movimento".
//
// IMPORTANTE: isto é o Expo web, não o Android. O TalkBack, a fonte grande do
// sistema Android (escala de fonte) e o APK não são testados aqui. A fonte grande
// é simulada com a viewport reduzida (o que dá o mesmo reflow de um zoom de 200%
// num celular de 390 px): o React Native web usa px e não segue a fonte do sistema.
//
// Como rodar (a partir da raiz do repositório; escolha portas livres):
//   1. cd server && PORT=8110 PGLITE_DIR=memory SEED_DEMO=1 CORS_ORIGINS=http://localhost:8111 npx tsx src/index.ts
//   2. cd mobile && EXPO_PUBLIC_API_URL=http://localhost:8110 npx expo start --web --port 8111
//   3. APP_URL=http://localhost:8111 API_URL=http://localhost:8110 node mobile/scripts/a11y-check.mjs
// Variáveis:
//   SHOTS_DIR=<pasta>  guarda uma captura de cada tela (normal e a 195 px) e o relatorio.json.
//   SIZES=390,260,195  larguras a conferir (padrão: as três). 390 = normal; 260 = ~150%; 195 = 200%.
//   SKIP_MOTION=1      pula a parte do "Reduzir movimento".
// Sai com código 1 se alguma verificação falhar. O axe vem de node_modules/axe-core
// (npm install -D axe-core -w web, que já o instala na raiz do repositório).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? 'http://localhost:8098';
const API = process.env.API_URL ?? 'http://localhost:8099';
const SHOTS = process.env.SHOTS_DIR;
const DEMO_PASSWORD = /DEMO_PASSWORD = '([^']+)'/.exec(readFileSync(join(here, '../../shared/src/data/demo.ts'), 'utf8'))[1];
const AXE_PATH = [join(here, '../../node_modules/axe-core/axe.min.js'), join(here, '../node_modules/axe-core/axe.min.js')].find(existsSync);
if (!AXE_PATH) {
  console.error('axe-core não encontrado. Rode: npm install -D axe-core -w web');
  process.exit(2);
}
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** Regras do axe desligadas porque dão falso positivo no markup do React Native web (a conferência própria está em inPageLabels). */
const AXE_OFF = ['label-content-name-mismatch'];

/** Larguras: 390 é o celular normal; 195 (DPR 4) equivale a 200% de zoom; 260 a ~150%. */
const SIZE_TABLE = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, tag: 'normal' },
  260: { width: 260, height: 563, deviceScaleFactor: 3, tag: 'w260' },
  195: { width: 195, height: 422, deviceScaleFactor: 4, tag: 'w195' },
};
const SIZES = (process.env.SIZES ?? '390,260,195').split(',').map((s) => SIZE_TABLE[s.trim()]).filter(Boolean);

// ------------------------------------------------------------------ resultado
const webOnlyNotes = new Set();
const results = []; // { group, size, name, ok, detail }
const started = Date.now();
let currentSize = '';
const check = (group, name, ok, detail = '') => {
  results.push({ group, size: currentSize, name, ok, detail });
  if (!ok) console.log(`FALHA ${String(Math.round((Date.now() - started) / 1000)).padStart(3)} s  [${currentSize}] ${group} · ${name}${detail ? `\n        ${detail.replace(/\n/g, '\n        ')}` : ''}`);
};
const info = (msg) => console.log(`      ${msg}`);

// ------------------------------------------------------------------ API
async function api(path, { token, body, method } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
/** Cria um alerta como a pessoa que leu o QR code; o servidor limita a 6 por minuto por IP, então espera e repete. */
async function createAlert(spotCode) {
  for (let i = 0; i < 12; i++) {
    const res = await api('/alerts', { body: { spotCode, kind: 'unsafe' } });
    if (res.status < 300) return res;
    if (res.status !== 429) throw new Error(`criar alerta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('criar alerta: limite do servidor não liberou em 2 minutos');
}
// O servidor limita o login a 10 a cada 5 minutos por IP: cada conta entra uma vez só e o token é reaproveitado.
const apiTokens = new Map();
const loginApi = async (name) => {
  if (!apiTokens.has(name)) {
    const res = await api('/auth/login', { body: { email: `${name}@bar-esquina.test`, password: DEMO_PASSWORD } });
    if (!res.body?.token) throw new Error(`login de ${name} pela API falhou (${res.status} ${JSON.stringify(res.body)}): se for "rate_limited", espere 5 minutos ou reinicie o servidor de teste`);
    apiTokens.set(name, res.body.token);
  }
  return apiTokens.get(name);
};

// ------------------------------------------------------------------ verificações dentro da página
// Cada função abaixo roda no navegador (page.evaluate): não pode usar nada de fora.

/** Rótulos: nome acessível de tudo que se toca, ícones decorativos e cabeçalho. */
function inPageLabels() {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const hidden = (el) => !!el.closest('[aria-hidden="true"], [inert]');
  const textOf = (node) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    if (node.getAttribute('aria-hidden') === 'true') return '';
    if (node.tagName.toLowerCase() === 'svg') return node.getAttribute('aria-label') ?? '';
    return [...node.childNodes].map(textOf).join(' ');
  };
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (t) return t;
    }
    const label = el.getAttribute('aria-label')?.trim();
    if (label) return label;
    if (el.labels?.length) return [...el.labels].map((l) => l.textContent.trim()).join(' ');
    const text = textOf(el).replace(/\s+/g, ' ').trim();
    if (text) return text;
    return el.getAttribute('title')?.trim() ?? '';
  };
  // Palavras de interface em inglês que não devem aparecer como nome.
  const english = /\b(button|close|back|open|submit|toggle|switch|loading|cancel|save|send|menu|settings|search|ok|yes|no|next|previous|done|delete|remove|edit|image|icon)\b/i;
  const roles = 'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=switch], [role=textbox], [role=checkbox], [role=combobox], [role=tab], [role=menuitem]';
  const problems = [];
  const names = [];
  const webOnly = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(roles)) {
    if (seen.has(el) || !shown(el) || hidden(el)) continue;
    seen.add(el);
    const name = nameOf(el);
    // Botão de voltar do cabeçalho do react-navigation na web ("Alertas, back"): no Android o cabeçalho é nativo.
    if (/, back$|^Go back$/.test(name)) {
      webOnly.push(`cabeçalho web: "${name}"`);
      continue;
    }
    const kind = el.getAttribute('role') || el.tagName.toLowerCase();
    names.push(`${kind}: ${name}`);
    // WCAG 2.5.3 (rótulo no nome): todo texto visível do controle está no nome, na mesma ordem. O axe tem uma regra
    // para isso (label-content-name-mismatch), mas ela cola os textos de blocos sem espaço ("Novohá 2 sBanheiro...")
    // e acusa o que está certo; por isso o axe roda sem ela (ver AXE_OFF) e a conferência é esta.
    if (name && el.getAttribute('aria-label')) {
      const norm = (t) => t.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      const accessible = norm(name);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let at = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement.closest('[aria-hidden="true"]')) continue;
        const part = norm(n.textContent);
        if (!part) continue;
        const found = accessible.indexOf(part, at);
        if (found < 0) {
          problems.push(`rótulo no nome (WCAG 2.5.3): o texto visível "${part}" não está no nome "${name.slice(0, 80)}"${accessible.includes(part) ? ' na mesma ordem' : ''}`);
          break;
        }
        at = found + part.length;
      }
    }
    if (!name) problems.push(`sem nome acessível: <${kind}> ${el.outerHTML.slice(0, 120)}`);
    else if (english.test(name)) problems.push(`nome fora do português: "${name}"`);
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.labels?.length)
      problems.push(`campo sem rótulo (só placeholder?): ${el.outerHTML.slice(0, 120)}`);
  }
  // Ícone (svg) à vista tem de ser escondido do leitor de tela, ou ter nome (imagem com sentido).
  for (const svg of document.querySelectorAll('svg')) {
    if (!shown(svg) || hidden(svg)) continue;
    const named = svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label')?.trim();
    if (!named) problems.push(`ícone exposto ao leitor de tela, sem nome: ${svg.outerHTML.slice(0, 100)}`);
    else if (svg.closest('button, [role=button], a[href], [role=link]') && textOf(svg.closest('button, [role=button], a[href], [role=link]')).replace(svg.getAttribute('aria-label'), '').trim())
      problems.push(`ícone com nome dentro de botão que já tem texto (lido duas vezes): "${svg.getAttribute('aria-label')}"`);
  }
  for (const img of document.querySelectorAll('img, [role=img]')) {
    if (!shown(img) || hidden(img) || img.tagName.toLowerCase() === 'svg') continue;
    // alt="" é a forma certa de marcar imagem decorativa.
    if (img.getAttribute('alt') === null && !(img.getAttribute('aria-label') ?? '').trim()) problems.push(`imagem sem texto alternativo: ${img.outerHTML.slice(0, 100)}`);
  }
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter((h) => shown(h) && !hidden(h)).map((h) => h.textContent.trim());
  return { problems, names, webOnly, headings, lang: document.documentElement.lang, title: document.title };
}

/** O texto (o menor elemento que o contém) está numa região viva? */
function inPageLive(texts) {
  const out = {};
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  for (const text of texts) {
    const candidates = [...document.querySelectorAll('body *')].filter((el) => shown(el) && !el.closest('[aria-hidden="true"]') && (el.textContent ?? '').includes(text) && ![...el.children].some((c) => (c.textContent ?? '').includes(text)));
    if (!candidates.length) {
      out[text] = 'texto não encontrado na tela';
      continue;
    }
    const live = candidates.map((el) => el.closest('[aria-live], [role=alert], [role=status], [role=log]')).find(Boolean);
    const mode = live?.getAttribute('aria-live') ?? (live?.getAttribute('role') === 'alert' ? 'assertive' : live ? 'polite' : null);
    out[text] = live && mode !== 'off' ? `ok:${mode}` : 'fora de região viva';
  }
  return out;
}

/** Reflow: rolagem lateral, texto cortado, alvos de toque, alcance e palavra-código. */
function inPageReflow() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = { hscroll: [], clipped: [], small: [], unreachable: [], overlap: [], broken: [], code: null, bar: null, vw, vh };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const dialog = [...document.querySelectorAll('[role=dialog]')].find(shown);
  const root = dialog ?? document.body;
  const live = (el) => root.contains(el) && !el.closest('[aria-hidden="true"], [inert]');
  const label = (el) => `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;

  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) out.hscroll.push(`documento: ${doc.scrollWidth} > ${doc.clientWidth}`);

  const all = [...document.querySelectorAll('body *')].filter(shown);
  for (const el of all) {
    if (!live(el)) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      out.hscroll.push(`rolagem lateral em ${label(el)}: ${el.scrollWidth} > ${el.clientWidth}`);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.hscroll.push(`texto fora da tela: ${label(el)} (${Math.round(r.left)}..${Math.round(r.right)} de ${vw})`);
    // O próprio elemento corta o que não cabe (numberOfLines, altura fixa)?
    if (cs.overflowY !== 'visible' && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && el.scrollHeight > el.clientHeight + 1)
      out.clipped.push(`${label(el)}: altura ${el.clientHeight} < conteúdo ${el.scrollHeight}`);
    if (cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && el.scrollWidth > el.clientWidth + 1)
      out.clipped.push(`${label(el)}: largura ${el.clientWidth} < conteúdo ${el.scrollWidth}`);
    // Algum ascendente com overflow escondido corta este texto?
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pc = getComputedStyle(p);
      const pr = p.getBoundingClientRect();
      const clipX = pc.overflowX === 'hidden' || pc.overflowX === 'clip';
      const clipY = pc.overflowY === 'hidden' || pc.overflowY === 'clip';
      if ((clipX && (r.right > pr.right + 1.5 || r.left < pr.left - 1.5)) || (clipY && (r.bottom > pr.bottom + 1.5 || r.top < pr.top - 1.5)))
        out.clipped.push(`${label(el)} cortado por ${p.tagName.toLowerCase()} (overflow escondido)`);
    }
  }

  // Alvos de toque e alcance: tudo que se toca tem 48 px de altura e dá para chegar nele rolando.
  const sel = 'button, a[href], input:not([type=hidden]), textarea, [role=button], [role=link], [role=switch], [role=textbox]';
  const targets = [...new Set([...document.querySelectorAll(sel)])].filter((el) => shown(el) && live(el));
  out.webOnly = [];
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.height >= 47.5) continue;
    const text = (el.getAttribute('aria-label') ?? '').trim();
    // Artefatos do React Native web, que no Android são controles nativos: o botão de voltar do cabeçalho
    // e o Switch (o RN web o desenha com 40 x 20 px; o do Android tem o alvo de toque nativo).
    if (/, back$|^Go back$/.test(text) || el.getAttribute('role') === 'switch') out.webOnly.push(`${label(el)}: ${Math.round(r.height)} px`);
    else out.small.push(`${label(el)}: ${Math.round(r.height)} px de altura`);
  }
  const scrollers = all.filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
  const saved = scrollers.map((s) => [s, s.scrollTop]);
  for (const el of targets) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    const top = document.elementFromPoint(x, y);
    if (!top || !(el.contains(top) || top.contains(el) && top === el)) out.unreachable.push(`${label(el)} fica coberto por ${top ? label(top) : 'nada'}`);
    else if (r.height > vh + 1 && false) out.unreachable.push(`${label(el)} maior que a tela`);
  }
  for (const [s, t] of saved) s.scrollTop = t;
  window.scrollTo(0, 0);

  const clipRect = (node, rc) => {
    let l = Math.max(rc.left, 0);
    let t = Math.max(rc.top, 0);
    let r = Math.min(rc.right, vw);
    let b = Math.min(rc.bottom, vh);
    for (let p = node; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') {
        l = Math.max(l, pr.left);
        r = Math.min(r, pr.right);
      }
      if (cs.overflowY !== 'visible') {
        t = Math.max(t, pr.top);
        b = Math.min(b, pr.bottom);
      }
    }
    return { left: l, top: t, right: r, bottom: b };
  };
  // Texto por cima de texto, e palavra quebrada no meio (a que não cabe na linha e vira "Banhe / iro").
  const lines = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !n.textContent.trim() || !shown(parent) || parent.closest('[aria-hidden="true"], [inert]')) continue;
    const re = /\S+/g;
    for (let m = re.exec(n.textContent); m; m = re.exec(n.textContent)) {
      if (!/^[\p{L}\p{N}]{5,}$/u.test(m[0])) continue;
      const word = document.createRange();
      word.setStart(n, m.index);
      word.setEnd(n, m.index + m[0].length);
      if (word.getClientRects().length > 1) out.broken.push(`"${m[0]}" quebrada em ${word.getClientRects().length} linhas`);
    }
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const rc of range.getClientRects()) {
      if (rc.width <= 1 || rc.height <= 1) continue;
      // Só conta o que se vê: a parte do texto que rolou para fora da área de rolagem não está na tela.
      const c = clipRect(parent, rc);
      if (c.right - c.left > 1 && c.bottom - c.top > 1) lines.push({ rc: c, height: rc.height, n, t: n.textContent.trim().slice(0, 25) });
    }
  }
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[i].n === lines[j].n) continue;
      const a = lines[i].rc;
      const b = lines[j].rc;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 0.4 * Math.min(lines[i].height, lines[j].height)) out.overlap.push(`"${lines[i].t}" por cima de "${lines[j].t}"`);
    }

  // Palavra-código inteira.
  const code = [...document.querySelectorAll('[aria-label^="Palavra-código"]')].find(shown);
  if (code) {
    const r = code.getBoundingClientRect();
    out.code = { text: code.textContent.trim(), clientWidth: code.clientWidth, scrollWidth: code.scrollWidth, clientHeight: code.clientHeight, scrollHeight: code.scrollHeight, left: Math.round(r.left), right: Math.round(r.right), ellipsis: getComputedStyle(code).textOverflow };
  }
  // Barra de ações do alerta: quanto da tela ela ocupa (sobra para rolar o resto?).
  const go = targets.find((t) => /Estou indo|Voltar aos alertas|Encerrar/.test(t.getAttribute('aria-label') ?? t.textContent));
  if (go && !dialog) {
    let bar = go.parentElement;
    while (bar && bar.parentElement && bar.getBoundingClientRect().width < vw - 4) bar = bar.parentElement;
    const br = bar.getBoundingClientRect();
    out.bar = { top: Math.round(br.top), height: Math.round(br.height), share: Math.round((br.height / vh) * 100), inView: br.bottom <= vh + 1 && br.top >= 0 };
  }
  return out;
}

// ------------------------------------------------------------------ roteiro
const browser = await chromium.launch();
const shotsMade = [];
let page;
/** Sessões do app (localStorage) de cada conta, guardadas depois de uma única entrada pela tela. */
const sessions = {};

const shown = (text) => page.getByText(text, { exact: false }).filter({ visible: true });
const visible = (text, timeout = 20_000) =>
  shown(text)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false,
    );
const gone = async (text, timeout = 30_000) => {
  const limit = Date.now() + timeout;
  while (Date.now() < limit) {
    if ((await shown(text).count()) === 0) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
const button = (name) => page.getByRole('button', { name }).filter({ visible: true }).first();

let shotNo = 0;
async function shot(slug, size) {
  if (!SHOTS || (size.tag !== 'normal' && size.tag !== 'w195')) return;
  const dir = join(SHOTS, 'app');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${size.tag}-${String(shotNo).padStart(2, '0')}-${slug}.png`);
  await page.screenshot({ path: file });
  shotsMade.push(file);
}

/** Confere uma tela/estado: axe, rótulos, cabeçalho, regiões vivas e reflow. */
async function audit(slug, size, { heading, live = [], note } = {}) {
  shotNo += 1;
  await page.waitForTimeout(950); // deixa o motion de mudança de estado terminar
  await shot(slug, size);
  const state = `${slug}`;
  // axe
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE_PATH });
  const axe = await page.evaluate(
    async ({ tags, off }) => {
      const rules = Object.fromEntries(off.map((id) => [id, { enabled: false }]));
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules, resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} :: ${n.html.slice(0, 110)}`), total: v.nodes.length }));
    },
    { tags: AXE_TAGS, off: AXE_OFF },
  );
  check('axe', state, axe.length === 0, axe.map((v) => `${v.id} (${v.impact}, ${v.total}x): ${v.help}\n  ${v.nodes.join('\n  ')}`).join('\n'));
  // rótulos
  const lab = await page.evaluate(inPageLabels);
  check('rótulos', state, lab.problems.length === 0, lab.problems.slice(0, 6).join('\n'));
  if (heading !== null) {
    const want = heading;
    const has = lab.headings.some((h) => (want ? h.includes(want) : true));
    check('cabeçalho', state, has, `esperava um heading${want ? ` com "${want}"` : ''}; achei: ${JSON.stringify(lab.headings)}`);
  }
  // regiões vivas
  if (live.length) {
    const found = await page.evaluate(inPageLive, live);
    for (const text of live) check('região viva', `${state} · "${text.slice(0, 40)}"`, String(found[text]).startsWith('ok'), String(found[text]));
  }
  // reflow
  const rf = await page.evaluate(inPageReflow);
  check('sem rolagem lateral', state, rf.hscroll.length === 0, [...new Set(rf.hscroll)].slice(0, 5).join('\n'));
  check('texto não cortado', state, rf.clipped.length === 0, [...new Set(rf.clipped)].slice(0, 5).join('\n'));
  for (const w of [...lab.webOnly, ...rf.webOnly]) webOnlyNotes.add(w);
  check('texto sem sobreposição', state, rf.overlap.length === 0, [...new Set(rf.overlap)].slice(0, 5).join('\n'));
  check('palavra inteira (sem quebra no meio)', state, rf.broken.length === 0, [...new Set(rf.broken)].slice(0, 5).join('\n'));
  check('alvos de 48 px', state, rf.small.length === 0, [...new Set(rf.small)].slice(0, 5).join('\n'));
  check('alcançável', state, rf.unreachable.length === 0, [...new Set(rf.unreachable)].slice(0, 5).join('\n'));
  if (rf.code) {
    const c = rf.code;
    const fits = c.scrollWidth <= c.clientWidth + 1 && c.scrollHeight <= c.clientHeight + 1 && c.left >= -1 && c.right <= rf.vw + 1;
    check('palavra-código inteira', state, fits, `"${c.text}": largura ${c.clientWidth} para conteúdo ${c.scrollWidth}, altura ${c.clientHeight} para ${c.scrollHeight}, na tela de ${c.left} a ${c.right} de ${rf.vw}`);
  }
  if (rf.bar) check('barra de ações à vista', state, rf.bar.inView && rf.bar.share <= 60, `a barra ocupa ${rf.bar.share}% da altura (${rf.bar.height} de ${rf.vh} px)`);
  if (note) info(`${state}: ${note(lab, rf)}`);
  return { lab, rf };
}

const signIn = async (name) => {
  if (name === 'diego') await button(/conta de teste do Diego/).click({ timeout: 180_000 });
  else {
    await page.getByRole('textbox', { name: 'E-mail' }).fill(`${name}@bar-esquina.test`);
    await page.getByRole('textbox', { name: 'Senha' }).fill(DEMO_PASSWORD);
  }
  await button('Entrar').click();
};

/** Entra pela tela uma vez por conta e guarda a sessão; os contextos seguintes já nascem logados. */
async function bootstrapSessions() {
  for (const name of ['diego', 'marta']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await signIn(name);
    const ok = await visible('Nenhum alerta agora', 60_000);
    if (!ok) throw new Error(`não consegui entrar como ${name} pela tela (limite de logins do servidor?)`);
    sessions[name] = await context.storageState();
    await context.close();
  }
}

async function runFlow(size) {
  currentSize = `${size.width} px`;
  shotNo = 0;
  console.log(`\n== ${size.width} x ${size.height} (escala ${size.deviceScaleFactor}) ==`);
  const viewport = { width: size.width, height: size.height };
  const loggedOut = await browser.newContext({ viewport, deviceScaleFactor: size.deviceScaleFactor });
  page = await loggedOut.newPage();
  let context;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const [ana, marta] = await Promise.all([loginApi('ana'), loginApi('marta')]);
  const newAlert = async (spotCode) => {
    const before = new Set((await api('/staff/alerts/active', { token: marta })).body.map((a) => a.id));
    await createAlert(spotCode);
    return (await api('/staff/alerts/active', { token: marta })).body.find((a) => !before.has(a.id));
  };
  const clearAll = async () => {
    for (const a of (await api('/staff/alerts/active', { token: marta })).body) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  };
  await clearAll();
  try {
    // 1. login
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await button(/conta de teste do Diego/).waitFor({ timeout: 180_000 });
    await audit('login', size, { heading: 'App da equipe' });
    await loggedOut.close();
    context = await browser.newContext({ viewport, deviceScaleFactor: size.deviceScaleFactor, storageState: sessions.diego });
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });

    // 2. lista vazia
    check('fluxo', 'entra na lista vazia', await visible('Nenhum alerta agora'));
    await audit('lista vazia', size, { heading: 'Nenhum alerta', live: ['Nenhum alerta agora'] });

    // 3. lista com alerta novo
    const first = await newAlert('ESQBF7K2');
    const card = page.getByRole('button', { name: new RegExp(first.spotLabel) }).first();
    await card.waitFor({ timeout: 20_000 });
    await audit('lista com alerta novo', size, { heading: 'alerta', live: ['1 alerta em aberto'] });

    // 4. alerta recém-aberto. Abrir já conta como "visto" (o toque é aplicado na hora, até sem sinal), então o
    //    "Novo" só aparece por um quadro na tela do alerta; o que a pessoa vê de verdade é "Visto".
    await card.click();
    await button('Estou indo').waitFor({ timeout: 20_000 });
    check('fluxo', 'abrir marca como visto', await visible('Visto', 10_000));
    await audit('alerta recém-aberto', size, { heading: first.spotLabel, live: ['Visto'] });

    // 5. a caminho
    await button('Estou indo').click();
    check('fluxo', 'Estou indo muda para a caminho', await visible('A caminho', 10_000));
    await audit('alerta a caminho', size, { heading: first.spotLabel, live: ['A caminho', 'Você está indo até ela'] });

    // 6. folha de desfechos
    await button(/Encerrar/).click();
    check('fluxo', 'abre a folha de desfechos', await visible('Como terminou?'));
    await audit('folha de desfechos aberta', size, { heading: 'Como terminou?' });
    // Esc fecha a folha (teclado)
    await page.keyboard.press('Escape');
    const closedByEsc = await gone('Como terminou?', 3000);
    check('teclado', 'Esc fecha a folha de desfechos', closedByEsc);
    if (!closedByEsc) await button('Fechar').click();
    await button(/Encerrar/).click();
    await visible('Como terminou?');
    await page.getByRole('button', { name: /Acompanhei até um lugar seguro/ }).click();

    // 7. encerrado
    check('fluxo', 'encerra o alerta', await visible('Resolvido', 10_000));
    await audit('alerta encerrado', size, { heading: first.spotLabel, live: ['Resolvido'] });
    await button(/Voltar aos alertas/).click();

    // 8. sem sinal no alerta
    const second = await newAlert('ESQM12T3');
    await page.getByRole('button', { name: new RegExp(second.spotLabel) }).first().click({ timeout: 20_000 });
    await button('Estou indo').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await context.setOffline(true);
    await button('Estou indo').click();
    check('fluxo', 'aviso de sem sinal aparece', await visible('Sem sinal: vai enviar quando voltar'));
    await audit('alerta com sem sinal', size, { heading: second.spotLabel, live: ['Sem sinal: vai enviar quando voltar', 'A caminho'] });

    // 9. lista com toque guardado
    await page.goBack();
    check('fluxo', 'lista mostra toque guardado', await visible('1 toque guardado: vai enviar quando o sinal voltar'));
    await audit('lista com toque guardado', size, { heading: 'alerta', live: ['1 toque guardado'] });

    // 10. aviso de "não foi enviado" (outra pessoa assumiu enquanto estava sem sinal)
    await api(`/staff/alerts/${second.id}/start`, { token: ana, body: {} });
    await context.setOffline(false);
    check('fluxo', 'aviso de não enviado aparece', await visible('não foi enviado: outra pessoa da equipe assumiu', 40_000));
    await audit('lista com aviso de não enviado', size, { heading: 'alerta', live: ['não foi enviado'] });

    // 11. ajustes
    await clearAll();
    await button('Ajustes').click();
    check('fluxo', 'abre os ajustes', await visible('Como você está vestido hoje?'));
    await audit('ajustes', size, { heading: 'Ajustes' });

    // 12. ajustes e cardápio da gerência (a conta da Marta)
    await context.close();
    context = await browser.newContext({ viewport, deviceScaleFactor: size.deviceScaleFactor, storageState: sessions.marta });
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await visible('Nenhum alerta agora', 60_000);
    await button('Ajustes').click();
    await visible('Wi-Fi do local');
    await audit('ajustes da gerência', size, { heading: 'Ajustes' });
    await page.getByRole('button', { name: 'Cadastrar o cardápio' }).first().click();
    await visible('Fotos do cardápio');
    await audit('cardápio', size, { heading: 'Cardápio' });

    check('fluxo', 'sem erro de JavaScript na página', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (err) {
    check('fluxo', 'o roteiro terminou', false, String(err).slice(0, 400));
    if (SHOTS) {
      mkdirSync(join(SHOTS, 'app'), { recursive: true });
      await page.screenshot({ path: join(SHOTS, 'app', `${size.tag}-falha.png`) }).catch(() => {});
    }
  } finally {
    await loggedOut.close().catch(() => {});
    await context?.close().catch(() => {});
  }
}

// ------------------------------------------------------------------ reduzir movimento
/**
 * Com o movimento ligado as etapas enchem aos poucos e o alerta novo pulsa; com
 * "Reduzir movimento" (o pedido do sistema, aqui por prefers-reduced-motion, ou a
 * chave dos Ajustes) a troca é na hora e o pulso para. Mede quadro a quadro.
 */
async function measureMotion(reduced, viaApp = false) {
  const tag = viaApp ? 'chave dos Ajustes' : reduced ? 'prefers-reduced-motion' : 'movimento ligado (controle)';
  currentSize = tag;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: reduced && !viaApp ? 'reduce' : 'no-preference', storageState: sessions.diego });
  page = await context.newPage();
  const marta = await loginApi('marta');
  for (const a of (await api('/staff/alerts/active', { token: marta })).body) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await visible('Nenhum alerta agora');
    if (viaApp) {
      await button('Ajustes').click();
      await visible('Reduzir movimento');
      const sw = page.getByRole('switch', { name: 'Reduzir movimento' });
      await sw.check({ force: true });
      check('reduzir movimento', `${tag}: a chave liga`, await sw.isChecked());
      await page.goBack();
      await visible('Nenhum alerta agora');
    }
    // Pulso do alerta novo: amostra a opacidade do halo por 2,6 s (dois ciclos de 1,2 s).
    await createAlert('ESQBF7K2');
    await page.getByRole('button', { name: /Banheiro feminino/ }).first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const pulse = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const card = [...document.querySelectorAll('[role=button]')].find((e) => /Palavra/.test(e.getAttribute('aria-label') ?? '') && e.getBoundingClientRect().width > 0);
          const halo = card?.previousElementSibling;
          const vals = [];
          const t0 = performance.now();
          const tick = () => {
            vals.push(halo ? Number(getComputedStyle(halo).opacity) : null);
            if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
            else resolve({ halo: !!halo, min: Math.min(...vals.filter((v) => v !== null)), max: Math.max(...vals.filter((v) => v !== null)), frames: vals.length });
          };
          tick();
        }),
    );
    if (reduced) check('reduzir movimento', `${tag}: o pulso do alerta novo para`, !pulse.halo || pulse.max - pulse.min < 0.05, JSON.stringify(pulse));
    else check('reduzir movimento', `${tag}: o pulso existe com o movimento ligado`, pulse.halo && pulse.max - pulse.min > 0.3, JSON.stringify(pulse));
    info(`${tag}: pulso ${JSON.stringify(pulse)}`);

    // Etapas do alerta: abre, mede de 0 a 1 quando toca em "Estou indo".
    await page.getByRole('button', { name: /Banheiro feminino/ }).first().click();
    await button('Estou indo').waitFor({ timeout: 20_000 });
    await visible('Visto', 10_000);
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('[aria-hidden="true"]')].find(
        (e) => e.children.length === 3 && [...e.children].every((c) => c.children.length === 1 && c.getBoundingClientRect().height > 4 && c.getBoundingClientRect().height < 8),
      );
      window.__rec = { found: !!row, steps: [], anims: 0, t: [] };
      if (!row) return;
      const t0 = performance.now();
      const tick = () => {
        const ratio = [...row.children].map((c) => Math.round((c.firstElementChild.getBoundingClientRect().width / c.getBoundingClientRect().width) * 100) / 100);
        window.__rec.steps.push(ratio[1]);
        window.__rec.t.push(Math.round(performance.now() - t0));
        window.__rec.anims = Math.max(window.__rec.anims, document.getAnimations().length);
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
      };
      tick();
    });
    await button('Estou indo').click();
    await page.waitForTimeout(1800);
    const rec = await page.evaluate(() => window.__rec);
    const mid = rec.steps.filter((v) => v > 0.02 && v < 0.98).length;
    const full = rec.steps.includes(1);
    info(`${tag}: etapa "a caminho" em ${rec.steps.length} quadros, ${mid} intermediários, animações CSS no pico: ${rec.anims}`);
    check('reduzir movimento', `${tag}: a etapa chega a 100%`, rec.found && full, JSON.stringify({ found: rec.found, last: rec.steps.slice(-3) }));
    if (reduced) check('reduzir movimento', `${tag}: as etapas enchem na hora (sem quadros intermediários)`, mid === 0 && rec.anims === 0, `${mid} quadros intermediários, ${rec.anims} animações`);
    else check('reduzir movimento', `${tag}: com movimento ligado as etapas enchem aos poucos`, mid >= 3, `${mid} quadros intermediários`);
  } catch (err) {
    check('reduzir movimento', `${tag}: o roteiro terminou`, false, String(err).slice(0, 300));
  } finally {
    await context.close();
    for (const a of (await api('/staff/alerts/active', { token: marta })).body) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  }
}

/** Região viva persistente: o nó do estado do alerta tem de ser o mesmo antes e depois da mudança. */
async function measureLiveRegion() {
  currentSize = 'região viva';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: sessions.diego });
  page = await context.newPage();
  const marta = await loginApi('marta');
  for (const a of (await api('/staff/alerts/active', { token: marta })).body) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await visible('Nenhum alerta agora');
    await createAlert('ESQBF7K2');
    await page.getByRole('button', { name: /Banheiro feminino/ }).first().click({ timeout: 20_000 });
    await button('Estou indo').waitFor({ timeout: 20_000 });
    await visible('Visto', 10_000);
    await page.waitForTimeout(600);
    // Guarda o nó da região viva que contém "Visto"; depois muda o estado e vê se ele continua na página.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('body *')].find((e) => e.getBoundingClientRect().width > 0 && (e.textContent ?? '').includes('Visto') && ![...e.children].some((c) => (c.textContent ?? '').includes('Visto')));
      window.__live = el?.closest('[aria-live], [role=alert], [role=status]') ?? null;
    });
    await button('Estou indo').click();
    await visible('A caminho', 10_000);
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ had: !!window.__live, connected: !!window.__live?.isConnected, text: window.__live?.textContent ?? '' }));
    check('região viva', 'o estado do alerta é uma região viva que continua na página quando o estado muda', r.had && r.connected && /A caminho/.test(r.text), `região achada: ${r.had}; ainda na página: ${r.connected}; texto agora: "${r.text.slice(0, 60)}"`);
  } catch (err) {
    check('região viva', 'o roteiro terminou', false, String(err).slice(0, 300));
  } finally {
    await context.close();
    for (const a of (await api('/staff/alerts/active', { token: marta })).body) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  }
}

/**
 * Autoteste dos detectores: injeta de propósito, numa página em branco estreita, o que cada verificação deve
 * pegar (texto largo demais, botão baixo, texto cortado, botão sem nome, ícone exposto, nome em inglês, texto
 * fora de região viva, botão coberto). Se um detector deixar passar, o resto do relatório não vale nada.
 */
async function selfTest() {
  currentSize = 'autoteste';
  const context = await browser.newContext({ viewport: { width: 195, height: 422 } });
  page = await context.newPage();
  await page.setContent(`<!doctype html><html lang="pt-BR"><body style="margin:0">
    <div style="position:absolute;left:0;top:0;width:400px;white-space:nowrap">Um texto muito mais largo que a tela</div>
    <button style="position:absolute;left:0;top:30px;height:20px">Pequeno</button>
    <div style="position:absolute;left:0;top:60px;width:50px;height:20px;overflow:hidden"><span style="white-space:nowrap">texto que não cabe na caixa</span></div>
    <button style="position:absolute;left:0;top:90px;height:48px"></button>
    <svg width="10" height="10" style="position:absolute;left:0;top:150px"><path d="M0 0h10" stroke="#000"/></svg>
    <button aria-label="Close" style="position:absolute;left:0;top:170px;height:48px">x</button>
    <p style="position:absolute;left:0;top:230px">Aviso sem região viva</p>
    <button style="position:fixed;left:10px;top:300px;height:48px;width:100px">Coberto</button>
    <div style="position:fixed;left:0;top:290px;width:195px;height:80px;background:#0001"></div>
    <div style="position:absolute;left:100px;top:330px;width:90px;font-size:16px">Sobreposto</div>
    <div style="position:absolute;left:110px;top:335px;font-size:16px">Em cima</div>
    <div style="position:absolute;left:0;top:380px;width:40px;font-size:16px;word-break:break-word;overflow-wrap:anywhere">Palavralonga</div>
    <button aria-label="Oi" style="position:absolute;left:100px;top:230px;height:48px"><span>Texto</span><span>visível</span></button>
  </body></html>`);
  const lab = await page.evaluate(inPageLabels);
  const rf = await page.evaluate(inPageReflow);
  const live = await page.evaluate(inPageLive, ['Aviso sem região viva']);
  const has = (list, re) => list.some((x) => re.test(x));
  check('autoteste', 'pega texto fora da tela', has(rf.hscroll, /texto fora da tela/), JSON.stringify(rf.hscroll));
  check('autoteste', 'pega botão com menos de 48 px', has(rf.small, /Pequeno/), JSON.stringify(rf.small));
  check('autoteste', 'pega texto cortado por overflow escondido', has(rf.clipped, /cortado/), JSON.stringify(rf.clipped));
  check('autoteste', 'pega botão sem nome', has(lab.problems, /sem nome acessível/), JSON.stringify(lab.problems));
  check('autoteste', 'pega ícone exposto ao leitor de tela', has(lab.problems, /ícone exposto/), JSON.stringify(lab.problems));
  check('autoteste', 'pega nome em inglês', has(lab.problems, /fora do português: "Close"/), JSON.stringify(lab.problems));
  check('autoteste', 'pega rótulo que não repete o texto visível', has(lab.problems, /rótulo no nome/), JSON.stringify(lab.problems));
  check('autoteste', 'pega aviso fora de região viva', live['Aviso sem região viva'] === 'fora de região viva', JSON.stringify(live));
  check('autoteste', 'pega texto por cima de texto', rf.overlap.length > 0, JSON.stringify(rf.overlap));
  check('autoteste', 'pega palavra quebrada no meio', has(rf.broken, /Palavralonga/), JSON.stringify(rf.broken));
  check('autoteste', 'pega botão coberto', has(rf.unreachable, /Coberto/), JSON.stringify(rf.unreachable));
  await context.close();
}


try {
  await selfTest();
  await bootstrapSessions();
  for (const size of SIZES) await runFlow(size);
  console.log('\n== Região viva do estado do alerta ==');
  await measureLiveRegion();
  if (!process.env.SKIP_MOTION) {
    console.log('\n== Reduzir movimento ==');
    await measureMotion(false);
    await measureMotion(true);
    await measureMotion(true, true);
  }
} finally {
  await browser.close();
}


const groups = [...new Set(results.map((r) => r.group))];
console.log('\nResumo por verificação:');
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  const bad = rs.filter((r) => !r.ok);
  console.log(`  ${bad.length ? 'FALHA' : 'ok   '} ${g}: ${rs.length - bad.length} de ${rs.length}`);
}
if (webOnlyNotes.size) {
  console.log('\nSó na web (artefatos do React Native web, não contam como falha; no Android são controles nativos):');
  for (const n of webOnlyNotes) console.log(`  - ${n}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} verificações passaram.`);
if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(join(SHOTS, 'app-relatorio.json'), JSON.stringify({ results, shots: shotsMade }, null, 2));
}
process.exit(failed.length ? 1 : 0);
