// Página "palco" de 1920x1080: as telas do produto em iframes, cada uma numa moldura
// (celular ou janela de computador), com rótulo, indicador de toque e cursor desenhados por cima.
// O palco é servido por um servidor HTTP mínimo na porta 8153, aberto e fechado pelo próprio
// gravador: com endereço local de verdade, o Chrome deixa os iframes falarem com o localhost
// (a checagem de acesso à rede local bloqueia uma página que não tem endereço). Nada muda no produto.
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { API, APP, REPO, STAGE, WIDTH, HEIGHT } from './env.mjs';

/** Cores da identidade (shared/src/tokens.ts). Lidas do arquivo para não divergirem. */
function tokens() {
  const src = readFileSync(join(REPO, 'shared', 'src', 'tokens.ts'), 'utf8');
  const pick = (k) => new RegExp(`\\b${k}: '(#[0-9A-Fa-f]{6})'`).exec(src)[1];
  return { borderStrong: pick('borderStrong'), bg: pick('bg'), surface: pick('surface'), surfaceRaised: pick('surfaceRaised'), border: pick('border'), text: pick('text'), textMuted: pick('textMuted'), accent: pick('accent'), alert: pick('alert') };
}

const FONTS = {
  'body-500.woff2': join(REPO, 'node_modules', '@fontsource', 'instrument-sans', 'files', 'instrument-sans-latin-500-normal.woff2'),
  'body-600.woff2': join(REPO, 'node_modules', '@fontsource', 'instrument-sans', 'files', 'instrument-sans-latin-600-normal.woff2'),
  'display-600.woff2': join(REPO, 'node_modules', '@fontsource', 'fraunces', 'files', 'fraunces-latin-600-normal.woff2'),
};

/** Imagens que as cartelas podem usar (servidas em /assets/<nome>): o logo e as imagens do PDF. */
const ASSET_DIRS = [join(REPO, 'web', 'public', 'brand'), join(REPO, 'docs', 'pdf', 'imagens')];
const ASSET_TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' };

export const PHONE = { w: 390, h: 844, bezel: 12 };
const LABEL_H = 30;
const LABEL_GAP = 14;
const TITLE_H = 36;

/**
 * Presets de composição. Cada painel: { id, kind: 'phone' | 'window', url, label, x, y, w, h }
 * (x, y = canto da moldura; w, h = tamanho da tela em px CSS, sem a moldura).
 *  - trio: página dela, app da equipe e painel (o clipe da integração);
 *  - phone: um celular no centro;
 *  - pair: dois celulares lado a lado;
 *  - desktop: o painel grande.
 */
export function layout(preset, panes) {
  const phoneOuter = { w: PHONE.w + 2 * PHONE.bezel, h: PHONE.h + 2 * PHONE.bezel };
  const blockH = LABEL_H + LABEL_GAP + phoneOuter.h;
  const top = Math.round((HEIGHT - blockH) / 2) + LABEL_H + LABEL_GAP;
  const out = [];
  if (preset === 'trio') {
    const [a, b, c] = panes;
    const left = 56;
    const gapPhones = 44;
    const xb = left + phoneOuter.w + gapPhones;
    const xc = xb + phoneOuter.w + 56;
    const wc = WIDTH - 56 - xc - 2;
    out.push({ ...a, kind: 'phone', x: left, y: top, w: PHONE.w, h: PHONE.h });
    out.push({ ...b, kind: 'phone', x: xb, y: top, w: PHONE.w, h: PHONE.h });
    out.push({ ...c, kind: 'window', x: xc, y: top, w: wc, h: phoneOuter.h - TITLE_H - 2 });
  } else if (preset === 'phone') {
    out.push({ ...panes[0], kind: 'phone', x: Math.round((WIDTH - phoneOuter.w) / 2), y: top, w: PHONE.w, h: PHONE.h });
  } else if (preset === 'pair') {
    const gap = 120;
    const x0 = Math.round((WIDTH - 2 * phoneOuter.w - gap) / 2);
    out.push({ ...panes[0], kind: 'phone', x: x0, y: top, w: PHONE.w, h: PHONE.h });
    out.push({ ...panes[1], kind: 'phone', x: x0 + phoneOuter.w + gap, y: top, w: PHONE.w, h: PHONE.h });
  } else if (preset === 'desktop') {
    const w = 1600;
    const h = 860;
    const y = Math.round((HEIGHT - (LABEL_H + LABEL_GAP + TITLE_H + h + 2)) / 2) + LABEL_H + LABEL_GAP;
    out.push({ ...panes[0], kind: 'window', x: Math.round((WIDTH - w - 2) / 2), y, w, h });
  } else if (preset === 'custom') {
    // Posições dadas pelo clipe (x, y, w, h, kind), para cenas com mais de um arranjo.
    out.push(...panes.filter((p) => !p.overlay));
  } else if (preset === 'card') {
    // Cartela de texto em tela cheia (cenas 1, 2, 11 e 12): `html` é o conteúdo, com as classes
    // .card, .card-big e .card-small do palco.
    out.push({ ...panes[0], kind: 'html' });
  } else {
    throw new Error(`preset desconhecido: ${preset}`);
  }
  // Cartelas por cima de qualquer preset (`overlay: true`), mostradas e escondidas pelo roteiro.
  if (preset !== 'card') out.push(...panes.filter((p) => p.overlay).map((p) => ({ ...p, kind: 'html' })));
  return out;
}

function paneHtml(p) {
  // `group`: as telas do mesmo grupo aparecem e somem juntas (__stage.showGroup); `hidden`: começa invisível.
  const g = p.group ? ` data-group="${p.group}"` : '';
  const hid = p.hidden ? ' is-hidden' : '';
  if (p.kind === 'html') return `<div class="card${hid}"${p.id ? ` id="${p.id}"` : ''}${g}>${p.html}</div>`;
  const label = p.label ? `<div class="label${hid}" data-label="${p.id}"${g} style="left:${p.x}px;top:${p.y - LABEL_H - LABEL_GAP}px">${p.label}</div>` : '';
  // `zoom`: a página abre com largura w/zoom e é ampliada (texto a 200% = zoom 2).
  const z = p.zoom ?? 1;
  const frame = (w, h) =>
    z === 1
      ? `<iframe id="${p.id}" name="${p.id}" src="${p.url}" width="${w}" height="${h}" allow="autoplay"></iframe>`
      : `<iframe id="${p.id}" name="${p.id}" src="${p.url}" width="${Math.round(w / z)}" height="${Math.round(h / z)}" allow="autoplay" style="transform:scale(${z});transform-origin:0 0"></iframe>`;
  if (p.kind === 'phone') {
    return `${label}<div class="phone${hid}"${g} data-pane="${p.id}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px"><div class="screen" style="width:${p.w}px;height:${p.h}px">${frame(p.w, p.h)}</div></div>`;
  }
  return `${label}<div class="window${hid}"${g} data-pane="${p.id}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px"><div class="titlebar"><i></i><i></i><i></i><span>${p.title ?? ''}</span></div>${frame(p.w, p.h)}</div>`;
}

export function stageHtml(panes) {
  const c = tokens();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>palco</title><style>
@font-face{font-family:"Instrument Sans";font-weight:500;src:url(/fonts/body-500.woff2) format("woff2")}
@font-face{font-family:"Instrument Sans";font-weight:600;src:url(/fonts/body-600.woff2) format("woff2")}
@font-face{font-family:Fraunces;font-weight:600;src:url(/fonts/display-600.woff2) format("woff2")}
html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:${c.bg}}
body{position:relative;font-family:"Instrument Sans",system-ui,sans-serif;color:${c.text};
 background:radial-gradient(1200px 700px at 30% 20%, ${c.surface} 0%, ${c.bg} 70%)}
.label{position:absolute;height:${LABEL_H}px;line-height:${LABEL_H}px;font-size:20px;font-weight:600;color:${c.textMuted};letter-spacing:.01em;white-space:nowrap}
.label::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.accent};margin-right:10px;vertical-align:1px}
.phone{position:absolute;padding:${PHONE.bezel}px;border-radius:52px;background:#050807;box-shadow:0 0 0 2px ${c.border},0 30px 80px rgba(0,0,0,.55)}
.phone .screen{border-radius:40px;overflow:hidden;background:${c.bg}}
.phone iframe{display:block;border:0;background:${c.bg}}
.phone,.window,.label,.card{transition:opacity .5s ease,transform .9s cubic-bezier(.4,0,.2,1)}
.is-hidden{opacity:0;pointer-events:none}
#keycap{position:absolute;left:50%;bottom:30px;transform:translate(-50%,20px);opacity:0;padding:8px 22px;border-radius:10px;background:${c.surfaceRaised};
 border:2px solid ${c.borderStrong};box-shadow:0 4px 0 ${c.border};font-size:26px;font-weight:600;color:${c.text};transition:opacity .2s ease,transform .12s ease,box-shadow .12s ease}
#keycap.on{opacity:1;transform:translate(-50%,0)}
.hl{position:absolute;border:3px solid ${c.accent};border-radius:14px;box-shadow:0 0 0 7px rgba(168,213,184,.16);opacity:0;transform:scale(1.06);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.8,.2,1)}
.hl.on{opacity:1;transform:none}
#keycap.press{transform:translate(-50%,4px);box-shadow:0 0 0 ${c.border}}
.window{position:absolute;border:1px solid ${c.border};border-radius:12px;overflow:hidden;background:${c.bg};box-shadow:0 30px 80px rgba(0,0,0,.55)}
.titlebar{height:${TITLE_H}px;display:flex;align-items:center;gap:8px;padding:0 14px;background:${c.surfaceRaised};border-bottom:1px solid ${c.border}}
.titlebar i{width:12px;height:12px;border-radius:50%;background:${c.border}}
.titlebar span{margin-left:12px;font-size:14px;font-weight:500;color:${c.textMuted}}
.window iframe{display:block;border:0;background:${c.bg}}
.card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:28px;text-align:center;padding:0 160px}
.card-big{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:160px;line-height:1;color:${c.alert}}
.card-title{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:64px;line-height:1.15;color:${c.text}}
.card-text{font-size:36px;font-weight:500;line-height:1.4;color:${c.text};max-width:1400px}
.card-small{font-size:22px;font-weight:500;line-height:1.45;color:${c.textMuted};max-width:1300px}
#overlay{position:absolute;inset:0;pointer-events:none;z-index:10}
.tap{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
 background:rgba(238,235,225,.28);border:3px solid rgba(238,235,225,.95);box-shadow:0 0 0 2px rgba(14,21,18,.55),0 4px 18px rgba(0,0,0,.45);
 transform:scale(.55);opacity:0;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s ease}
.tap.on{transform:scale(1);opacity:1}
.tap.press{transform:scale(.82)}
.tap.off{transform:scale(1.25);opacity:0;transition:transform .45s ease,opacity .45s ease}
#cursor{position:absolute;left:0;top:0;width:28px;height:28px;display:none;will-change:transform}
#cursor.on{display:block}
.click-ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:3px solid rgba(238,235,225,.95);opacity:.9;transform:scale(.4);transition:transform .45s ease,opacity .45s ease}
.click-ring.go{transform:scale(1.2);opacity:0}
</style></head><body>
${panes.map(paneHtml).join('\n')}
<div id="overlay"><div id="keycap"></div><svg id="cursor" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25.5 L16.5 24 L13 15.8 L20.5 15.8 Z" fill="#FFFFFF" stroke="#0E1512" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
<script>
const overlay = document.getElementById('overlay');
const cursor = document.getElementById('cursor');
let cur = { x: 0, y: 0 };
const place = (x, y) => { cur = { x, y }; cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; };
window.__stage = {
  /** Indicador de toque: aparece no ponto; press() aperta; release() some. */
  tapShow(x, y) {
    const el = document.createElement('div');
    el.className = 'tap'; el.style.left = x + 'px'; el.style.top = y + 'px';
    overlay.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    window.__tapEl = el;
  },
  tapPress() { window.__tapEl?.classList.add('press'); },
  tapRelease() {
    const el = window.__tapEl; if (!el) return;
    el.classList.remove('press'); el.classList.add('off');
    setTimeout(() => el.remove(), 600); window.__tapEl = null;
  },
  cursorShow(x, y) { place(x, y); cursor.classList.add('on'); },
  cursorHide() { cursor.classList.remove('on'); },
  /** Move o cursor até (x, y) em ms, com aceleração suave. */
  cursorMove(x, y, ms) {
    const from = { ...cur }; const t0 = performance.now();
    return new Promise((done) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        place(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  },
  /** Mostra as telas e cartelas de um grupo e esconde as dos outros grupos. */
  showGroup(name) {
    document.querySelectorAll('[data-group]').forEach((el) => el.classList.toggle('is-hidden', el.dataset.group !== name));
  },
  show(sel, on = true) { document.querySelectorAll(sel).forEach((el) => el.classList.toggle('is-hidden', !on)); },
  setLabel(id, text) { const el = document.querySelector('[data-label="' + id + '"]'); if (el) el.textContent = text; },
  /** Aproxima a moldura da tela id: escala k, com o ponto (fx, fy) do palco no centro da imagem. */
  zoom(id, k, fx, fy) {
    const el = document.querySelector('[data-pane="' + id + '"]');
    if (k === 1) { el.style.transform = ''; return; }
    el.style.transformOrigin = '0 0';
    const x0 = parseFloat(el.style.left); const y0 = parseFloat(el.style.top);
    const tx = ${WIDTH} / 2 - fx - (fx - x0) * (k - 1); const ty = ${HEIGHT} / 2 - fy - (fy - y0) * (k - 1);
    el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')';
  },
  /** Tecla na tela: aparece embaixo, no centro, enquanto o roteiro aperta a tecla. */
  keyShow(name) { const k = document.getElementById('keycap'); k.textContent = name; k.classList.add('on'); },
  keyPress(on) { document.getElementById('keycap').classList.toggle('press', on); },
  keyHide() { document.getElementById('keycap').classList.remove('on'); },
  /** Realce: um contorno em volta de (x, y, w, h), com folga de pad px. */
  highlight(x, y, w, h, pad = 10) {
    const el = document.createElement('div'); el.className = 'hl';
    Object.assign(el.style, { left: (x - pad) + 'px', top: (y - pad) + 'px', width: (w + 2 * pad) + 'px', height: (h + 2 * pad) + 'px' });
    overlay.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  },
  clearHighlights() {
    document.querySelectorAll('.hl').forEach((el) => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); });
  },
  /** Liga as animações das cartelas (classe no body). */
  go(cls) { document.body.classList.add(cls || 'go'); },
  cursorClick() {
    const el = document.createElement('div'); el.className = 'click-ring';
    el.style.left = cur.x + 'px'; el.style.top = cur.y + 'px'; overlay.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go')));
    setTimeout(() => el.remove(), 600);
  },
};
</script></body></html>`;
}

/**
 * Prepara o contexto: serve o palco e as fontes, tira só nesta gravação local os
 * cabeçalhos que impedem iframe (X-Frame-Options e frame-ancestors), bloqueia a produção
 * e injeta as sessões já abertas (sem tela de login).
 */
export async function prepareContext(context, { panes, sessions = {}, panelAlarm = false, offlineSwitch = false }) {
  const blocked = [];
  await context.route(/naoenao\.obrian\.me/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  const unframe = async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    delete headers['x-frame-options'];
    if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replace(/frame-ancestors[^;]*;?/i, '');
    return route.fulfill({ response: resp, headers });
  };
  await context.route(`${API}/**`, unframe);
  await context.route(`${APP}/**`, unframe);

  // Sessões: o token vai direto para o armazenamento de cada origem, antes do app ler.
  const byOrigin = {};
  if (sessions.panel) byOrigin[new URL(API).origin] = { 'nenm.session': sessions.panel, ...(panelAlarm ? { 'mariana.panel.alarm': 'on' } : {}) };
  if (sessions.app) byOrigin[new URL(APP).origin] = { 'nenm.session': sessions.app };
  await context.addInitScript((map) => {
    const items = map[location.origin];
    if (!items) return;
    // Num iframe de outra origem o Chrome nega o aviso do navegador (Notification), e o painel
    // mostraria "O navegador bloqueou os avisos". Na operação real a gerência permite os avisos;
    // aqui o aviso vira um objeto vazio com permissão concedida (só nesta gravação).
    if (window.top !== window && 'Notification' in window && items['mariana.panel.alarm']) {
      class FakeNotification {
        static permission = 'granted';
        static requestPermission() { return Promise.resolve('granted'); }
        close() {}
      }
      window.Notification = FakeNotification;
    }
    try {
      for (const [k, v] of Object.entries(items)) if (localStorage.getItem(k) !== v) localStorage.setItem(k, v);
    } catch {}
  }, byOrigin);
  // Rede só do app (cena 8): o fetch e o WebSocket do app para o servidor local passam por uma
  // chave (window.__videoNet.set). Ligada, o fetch falha como sem sinal (TypeError) e o tempo real
  // cai; a página dela continua com rede. A recarga do pacote do Expo não passa pela chave.
  if (offlineSwitch) {
    await context.addInitScript(({ appOrigin, api }) => {
      if (location.origin !== appOrigin) return;
      const wsApi = api.replace(/^http/, 'ws');
      const toApi = (u) => {
        const s = String(typeof Request !== 'undefined' && u instanceof Request ? u.url : u);
        return s.startsWith(api) || s.startsWith(wsApi);
      };
      const realFetch = window.fetch.bind(window);
      const RealWS = window.WebSocket;
      const sockets = new Set();
      const net = { offline: false };
      window.__videoNet = {
        get offline() { return net.offline; },
        set(v) {
          net.offline = !!v;
          if (net.offline) for (const ws of sockets) try { ws.close(); } catch {}
        },
      };
      window.fetch = (input, init) => (net.offline && toApi(input) ? Promise.reject(new TypeError('Failed to fetch')) : realFetch(input, init));
      function VideoWS(url, protocols) {
        if (!toApi(url)) return new RealWS(url, protocols);
        const ws = net.offline ? new RealWS('ws://127.0.0.1:9/') : new RealWS(url, protocols);
        sockets.add(ws);
        ws.addEventListener('close', () => sockets.delete(ws));
        return ws;
      }
      VideoWS.prototype = RealWS.prototype;
      Object.assign(VideoWS, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
      window.WebSocket = VideoWS;
    }, { appOrigin: new URL(APP).origin, api: new URL(API).origin });
  }
  return { blocked };
}

/** Sobe o servidor do palco (porta de STAGE). Devolve a URL e o close(). */
export async function startStageServer(panes) {
  const port = Number(new URL(STAGE).port);
  const server = createServer((req, res) => {
    const path = new URL(req.url, STAGE).pathname;
    if (path.startsWith('/fonts/') && FONTS[path.slice(7)]) {
      res.writeHead(200, { 'content-type': 'font/woff2' });
      return res.end(readFileSync(FONTS[path.slice(7)]));
    }
    if (path.startsWith('/assets/')) {
      const name = decodeURIComponent(path.slice(8));
      const dir = !name.includes('/') && !name.includes('..') && ASSET_DIRS.find((d) => existsSync(join(d, name)));
      if (dir) {
        res.writeHead(200, { 'content-type': ASSET_TYPES[name.split('.').pop()] ?? 'application/octet-stream' });
        return res.end(readFileSync(join(dir, name)));
      }
    }
    if (path === '/palco.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(stageHtml(panes));
    }
    res.writeHead(404).end();
  });
  await new Promise((ok, fail) => server.once('error', fail).listen(port, '127.0.0.1', ok));
  return { url: `${STAGE}/palco.html`, close: () => new Promise((ok) => server.close(() => ok())) };
}
