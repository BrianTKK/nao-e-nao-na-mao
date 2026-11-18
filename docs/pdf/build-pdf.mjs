#!/usr/bin/env node
/**
 * Gera o PDF de entrega da Mariana a partir do Markdown.
 *
 *   node docs/pdf/build-pdf.mjs
 *
 * Lê Mariana_PDF.md (ao lado deste script), escreve Mariana_PDF.html
 * (autossuficiente: CSS, fontes e logo embutidos) e imprime Mariana_PDF.pdf
 * em A4 com o Chromium do Playwright que o pacote web já instala.
 * Não usa dependência nova: o conversor de Markdown está aqui mesmo.
 *
 * Opções (argumento ou variável de ambiente):
 *   --in=<arquivo.md>       MD_IN        entrada (padrão: Mariana_PDF.md ao lado do script)
 *   --out-dir=<pasta>       PDF_OUT_DIR  saída (padrão: a pasta do script)
 *   --imagens=<pasta>       IMAGENS_DIR  imagens (padrão: imagens/ ao lado do script)
 *   --repo=<pasta>          REPO_ROOT    raiz do repositório (padrão: dois níveis acima do script)
 *   --nome=<nome>           PDF_NOME     nome dos arquivos de saída, sem extensão (padrão: o do .md)
 *   --capturas=1,2,9        CAPTURAS     gera PNG dessas páginas em <saída>/capturas,
 *                                        mais visao-geral.png com todas as páginas ("todas" gera todas)
 *
 * Documento curto (cabeçalho compacto no lugar da capa de página inteira):
 * a primeira linha do Markdown traz um comentário com as opções, por exemplo
 *
 *   <!-- pdf: capa=compacta; topo=Mariana · Resumo -->
 *
 *   capa=inteira|compacta   inteira (padrão) = capa escura de página inteira, com integrantes;
 *                           compacta = faixa escura no topo da página 1, com logo, título (# do
 *                           Markdown), subtítulo (linha em negrito) e as notas antes do primeiro ##
 *   sumario=sim|nao         padrão: sim na capa inteira, nao na compacta
 *   quebra=sim|nao          cada ## começa página nova; padrão: sim na inteira, nao na compacta
 *   topo=<texto>            texto do topo das páginas (padrão: o título)
 *
 * Sem o comentário, o resultado é o de sempre (Mariana_PDF.md). Outros comentários
 * <!-- ... --> de uma linha são ignorados, e <!-- colunas: 8%, 20%, , 30% --> logo antes
 * de uma tabela fixa a largura das colunas dela (vazio = automática).
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ---------- opções ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const opt = (name, env, fallback) => args[name] ?? process.env[env] ?? fallback;

const repoRoot = path.resolve(opt('repo', 'REPO_ROOT', path.join(scriptDir, '..', '..')));
// fora do repositório, sem --in, cai no Mariana_PDF.md de docs/pdf da raiz informada
const defaultMd = fs.existsSync(path.join(scriptDir, 'Mariana_PDF.md'))
  ? path.join(scriptDir, 'Mariana_PDF.md')
  : path.join(repoRoot, 'docs', 'pdf', 'Mariana_PDF.md');
const mdIn = path.resolve(opt('in', 'MD_IN', defaultMd));
const outDir = path.resolve(opt('out-dir', 'PDF_OUT_DIR', scriptDir));
// imagens ao lado do Markdown (no repositório, é a mesma pasta do script)
const imagesDir = path.resolve(opt('imagens', 'IMAGENS_DIR', path.join(path.dirname(mdIn), 'imagens')));
const capturasOpt = opt('capturas', 'CAPTURAS', '');
const baseName = opt('nome', 'PDF_NOME', path.basename(mdIn, path.extname(mdIn)));
const htmlOut = path.join(outDir, `${baseName}.html`);
const pdfOut = path.join(outDir, `${baseName}.pdf`);

const requireFromRepo = createRequire(path.join(repoRoot, 'web', 'package.json'));

function packageDir(name) {
  try {
    return path.dirname(requireFromRepo.resolve(`${name}/package.json`));
  } catch {
    /* pacote com "exports" que não expõe package.json */
  }
  for (const base of [path.join(repoRoot, 'node_modules'), path.join(repoRoot, 'web', 'node_modules')]) {
    const dir = path.join(base, ...name.split('/'));
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`Pacote ${name} não encontrado a partir de ${repoRoot}. Rode npm install na raiz do repositório.`);
}

// ---------- identidade visual (shared/src/tokens.ts, adaptada para papel) ----------
const brand = {
  garrafa: '#0E1512', // fundo do produto; aqui, texto e capa
  surface: '#16201B',
  border: '#33433A',
  textOnDark: '#EEEBE1',
  mutedOnDark: '#A9B3AA',
  sage: '#A8D5B8',
  brass: '#FFB840', // latão: fios, rótulos e destaques (nunca texto sobre papel)
  onBrass: '#1A1200',
  leaf: '#2E5E48', // verde para fundo claro (logo positivo): títulos e links
  paperMuted: '#4A5A50',
};

// ---------- Markdown ----------
const MARK_RE = /⬜\s*(PREENCHER|IMAGEM|CONFERIR)\b[:.]?\s*/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const lead = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const isBlockStart = (l, next) =>
  /^\s*#{1,6}\s/.test(l) ||
  /^\s*```/.test(l) ||
  /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) ||
  /^\s*>/.test(l) ||
  (/^\s*\|/.test(l) && next !== undefined && isTableSep(next)) ||
  LIST_RE.test(l);

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseList(lines, i) {
  const m0 = lines[i].match(LIST_RE);
  const indent = lead(lines[i]);
  const ordered = /\d/.test(m0[2]);
  const start = ordered ? parseInt(m0[2], 10) : null;
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || lead(lines[i]) !== indent || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = indent + m[2].length + 1;
    const itemLines = [m[3]];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '') {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && lead(lines[j]) > indent) { itemLines.push(''); i++; continue; }
        break;
      }
      if (lead(l) <= indent) {
        if (isBlockStart(l, lines[i + 1])) break;
        itemLines.push(l.trim()); // continuação preguiçosa do parágrafo
        i++;
        continue;
      }
      itemLines.push(l.slice(Math.min(lead(l), contentIndent)));
      i++;
    }
    items.push(parseBlocks(itemLines));
  }
  return { block: { type: 'list', ordered, start, items }, next: i };
}

const COMMENT_RE = /^\s*<!--(.*?)-->\s*$/;

function parseBlocks(lines) {
  const blocks = [];
  let widths = null; // <!-- colunas: ... --> vale para a próxima tabela
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    const cm = line.match(COMMENT_RE);
    if (cm) {
      const w = cm[1].match(/^\s*colunas:\s*(.*?)\s*$/);
      if (w) widths = w[1].split(',').map((s) => s.trim());
      i++;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : null,
      );
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(widths ? { type: 'table', header, aligns, rows, widths } : { type: 'table', header, aligns, rows });
      widths = null;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parseBlocks(body) });
      continue;
    }
    if (LIST_RE.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    // parágrafo; uma linha que começa com ⬜ vira um bloco de pendência próprio
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !(para.length && isBlockStart(lines[i], lines[i + 1]))) {
      para.push(lines[i++].trim());
    }
    let buf = [];
    const flush = () => { if (buf.length) blocks.push({ type: 'para', text: buf.join(' ') }); buf = []; };
    for (const l of para) {
      if (l.startsWith('⬜')) { flush(); blocks.push({ type: 'pend', text: l }); } else buf.push(l);
    }
    flush();
  }
  return blocks;
}

// ---------- inline ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmt(text) {
  const store = [];
  const keep = (html) => `\u0000${store.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, c) => keep(`<code${c.length <= 24 ? ' class="nb"' : ''}>${esc(c)}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => keep(`<a href="${esc(u)}">${emph(esc(t))}</a>`));
  s = s.replace(/https?:\/\/[^\s<>()]*[^\s<>().,;:!?]/g, (u) => keep(`<a href="${esc(u)}" class="url">${esc(u)}</a>`));
  s = emph(esc(s));
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => store[n]);
  return s;
}
function emph(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)([^_]+?)_(?!\w)/g, '$1<em>$2</em>');
}
const plain = (s) =>
  s.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?|__?/g, '').trim();

const GLYPH_RE = new RegExp('[^\\x20-\\x7E\\u00A0-\\u024F\\n]', 'gu');
const LABEL = { PREENCHER: 'A PREENCHER', IMAGEM: 'IMAGEM A INSERIR', CONFERIR: 'A CONFERIR' };

// ---------- render ----------
const state = { h2: 'Capa', h3: null, pend: [], images: 0, ids: new Set() };

function record(kind, text, where) {
  const section = state.h3 ? `${state.h2} › ${state.h3}` : state.h2;
  state.pend.push({ kind, text: plain(text), section, where });
}

/** Texto com possível marcador ⬜ no meio: o que vem depois do marcador vira a pendência. */
function inline(text, ctx = {}) {
  const m = text.match(MARK_RE);
  if (!m) return fmt(text);
  const before = text.slice(0, m.index).trim();
  const rest = text.slice(m.index + m[0].length).trim();
  if (ctx.record !== false) record(m[1], rest, ctx.where);
  const tag = `<span class="pend-tag">${LABEL[m[1]]}</span>`;
  if (!before && ctx.block) return `<div class="pend pend-${m[1].toLowerCase()}">${tag}<span class="pend-text">${fmt(rest)}</span></div>`;
  return `${before ? fmt(before) + ' ' : ''}<span class="pend pend-inline pend-${m[1].toLowerCase()}">${tag}${fmt(rest)}</span>`;
}

function slug(s) {
  const base =
    plain(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'secao';
  let id = base;
  for (let n = 2; state.ids.has(id); n++) id = `${base}-${n}`;
  state.ids.add(id);
  return id;
}

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];

function suggestedName(n, text) {
  const words = plain(text)
    .split(/[,(:;]/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (['a', 'o', 'as', 'os'].includes(words[0])) words.shift();
  return `${String(n).padStart(2, '0')}-${words.slice(0, 5).join('-')}.png`;
}

function renderImage(text) {
  const n = ++state.images;
  const caption = text.charAt(0).toUpperCase() + text.slice(1); // só na legenda; o Markdown fica igual
  const prefix = String(n).padStart(2, '0');
  const file = imageFiles
    .filter((f) => IMG_EXT.includes(path.extname(f).toLowerCase()))
    .find((f) => f.startsWith(`${prefix}-`) || f.startsWith(`${prefix}.`) || f.startsWith(`${prefix}_`));
  if (file) {
    const data = fs.readFileSync(path.join(imagesDir, file)).toString('base64');
    const mime = MIME[path.extname(file).toLowerCase()];
    return `<figure class="shot"><img src="data:${mime};base64,${data}" alt="${esc(plain(text))}"><figcaption><span class="fig-n">Figura ${n}.</span> ${fmt(caption)}</figcaption></figure>`;
  }
  const expected = `imagens/${suggestedName(n, text)}`;
  record('IMAGEM', text, `arquivo ${expected}`);
  return `<div class="pend pend-imagem pend-figure"><span class="pend-tag">${LABEL.IMAGEM}</span><span class="pend-text"><span class="fig-n">Figura ${n}.</span> ${fmt(caption)}</span><span class="pend-file">Arquivo esperado: <code>${esc(expected)}</code> (ou qualquer nome que comece com <code>${prefix}-</code>)</span></div>`;
}

// larguras sugeridas por nome de coluna (o resto se ajusta sozinho)
const COL_WIDTH = {
  'Etapa': '14%', 'Onde': '12%', 'Fonte': '17%', 'Norma': '18%', 'Quem age': '13%', 'Ação': '16%',
  'Requisito': '15%', 'ODS e meta': '15%', 'Limite': '20%', 'Item': '34%', 'O quê': '32%',
  'Campo': '22%', 'Escolha': '33%', 'RM': '30%',
};
function renderTable(b) {
  const narrow = (h) => /^#$|^nº$/i.test(plain(h));
  const colgroup = b.widths
    ? `<colgroup>${b.header.map((_, c) => (b.widths[c] ? `<col style="width:${esc(b.widths[c])}">` : '<col>')).join('')}</colgroup>`
    : `<colgroup>${b.header.map((h) => (narrow(h) ? '<col style="width:7mm">' : COL_WIDTH[plain(h)] ? `<col style="width:${COL_WIDTH[plain(h)]}">` : '<col>')).join('')}</colgroup>`;
  const cols = b.header.length;
  const head = b.header
    .map((h, c) => `<th${narrow(h) ? ' class="col-n"' : ''}${b.aligns[c] ? ` style="text-align:${b.aligns[c]}"` : ''}>${fmt(h)}</th>`)
    .join('');
  const body = b.rows
    .map((r, ri) => {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        const t = r[c] ?? '';
        const rowLabel = c > 0 && !MARK_RE.test(r[0] ?? '') ? plain(r[0] ?? '') : '';
        const row = rowLabel && !/^\d+$/.test(rowLabel) ? `linha "${rowLabel}"` : `linha ${rowLabel || ri + 1}`;
        const where = `tabela, ${row}, coluna "${plain(b.header[c] ?? '')}"`;
        cells.push(`<td${narrow(b.header[c] ?? '') ? ' class="col-n"' : ''}${b.aligns[c] ? ` style="text-align:${b.aligns[c]}"` : ''}>${inline(t, { block: true, where })}</td>`);
      }
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('\n');
  return `<table class="cols-${cols}">${colgroup}<thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

function renderBlocks(blocks, { tight = false } = {}) {
  const out = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    const next = blocks[k + 1];
    switch (b.type) {
      case 'heading': {
        const lvl = Math.min(Math.max(b.level, 2), 4);
        if (b.level === 2) { state.h2 = plain(b.text); state.h3 = null; } else if (b.level === 3) state.h3 = plain(b.text);
        const id = slug(b.text);
        const m = b.text.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);
        const inner = m ? `<span class="num">${esc(m[1])}</span> ${fmt(m[2])}` : fmt(b.text);
        out.push(`<h${lvl} id="${id}"${b.first ? ' class="first"' : ''}>${inner}</h${lvl}>`);
        if (b.level <= 3) toc.push({ level: b.level, id, text: b.text });
        break;
      }
      case 'hr':
        if (!(next && next.type === 'heading' && next.level === 2)) out.push('<hr>');
        break;
      case 'code':
        // fora do latim (fios, setas), cada caractere ocupa exatamente uma coluna,
        // mesmo que venha de uma fonte de reserva com outra largura
        out.push(`<pre class="diagram">${esc(b.text).replace(GLYPH_RE, (ch) => `<span class="g">${ch}</span>`)}</pre>`);
        break;
      case 'table':
        out.push(renderTable(b));
        break;
      case 'quote':
        out.push(`<blockquote>${renderBlocks(b.blocks)}</blockquote>`);
        break;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        const startAttr = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
        const items = b.items.map((it) => `<li>${renderBlocks(it, { tight: true })}</li>`).join('\n');
        out.push(`<${tag}${startAttr}>\n${items}\n</${tag}>`);
        break;
      }
      case 'pend': {
        const m = b.text.match(MARK_RE);
        if (m && m[1] === 'IMAGEM') {
          // imagens seguidas formam uma galeria
          const group = [b];
          while (blocks[k + 1] && blocks[k + 1].type === 'pend' && /^⬜\s*IMAGEM/.test(blocks[k + 1].text)) group.push(blocks[++k]);
          const items = group.map((g) => renderImage(g.text.slice(g.text.match(MARK_RE)[0].length + g.text.match(MARK_RE).index).trim()));
          out.push(`<div class="gallery">${items.join('\n')}</div>`);
        } else {
          out.push(inline(b.text, { block: true, where: 'parágrafo' }));
        }
        break;
      }
      case 'para': {
        const html = inline(b.text, { where: 'parágrafo' });
        out.push(tight && blocks.length === 1 ? html : `<p>${html}</p>`);
        break;
      }
    }
  }
  return out.join('\n');
}

const toc = [];

// ---------- fontes e logo ----------
function fontFaces() {
  const fr = path.join(packageDir('@fontsource/fraunces'), 'files');
  const is = path.join(packageDir('@fontsource/instrument-sans'), 'files');
  const faces = [
    ['Fraunces', fr, 'fraunces', 400, 'normal'],
    ['Fraunces', fr, 'fraunces', 600, 'normal'],
    ['Fraunces', fr, 'fraunces', 400, 'italic'],
    ['Instrument Sans', is, 'instrument-sans', 400, 'normal'],
    ['Instrument Sans', is, 'instrument-sans', 400, 'italic'],
    ['Instrument Sans', is, 'instrument-sans', 600, 'normal'],
    ['Instrument Sans', is, 'instrument-sans', 600, 'italic'],
    ['Instrument Sans', is, 'instrument-sans', 700, 'normal'],
  ];
  const css = [];
  for (const [family, dir, prefix, weight, style] of faces) {
    for (const subset of ['latin', 'latin-ext']) {
      const file = path.join(dir, `${prefix}-${subset}-${weight}-${style}.woff2`);
      if (!fs.existsSync(file)) {
        if (subset === 'latin') throw new Error(`Fonte não encontrada: ${file}`);
        continue;
      }
      const range = subset === 'latin'
        ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
        : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
      css.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format("woff2");unicode-range:${range};}`);
    }
  }
  return css.join('\n');
}

function logoSvg() {
  const file = path.join(repoRoot, 'web', 'public', 'brand', 'logo-negativo.svg');
  if (!fs.existsSync(file)) return null;
  return fs
    .readFileSync(file, 'utf8')
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg /, '<svg class="logo" ')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '');
}

// ---------- montagem ----------
const md = fs.readFileSync(mdIn, 'utf8').replace(/\r\n?/g, '\n');
// opções do documento: <!-- pdf: capa=compacta; sumario=nao; quebra=nao; topo=... --> no topo
const meta = (() => {
  const m = md.match(/^\s*<!--\s*pdf:(.*?)-->/);
  const o = {};
  if (m) for (const part of m[1].split(';')) {
    const kv = part.match(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/);
    if (kv) o[kv[1].toLowerCase()] = kv[2];
  }
  return o;
})();
const yes = (v, d) => (v === undefined ? d : /^(sim|s|1|true|yes)$/i.test(v));
const compact = /^compacta?$/i.test(meta.capa ?? '');
const showToc = yes(meta.sumario, !compact);
const breakH2 = yes(meta.quebra, !compact);
const all = parseBlocks(md.split('\n'));
const firstH2 = all.findIndex((b) => b.type === 'heading' && b.level === 2);
const pre = firstH2 === -1 ? all : all.slice(0, firstH2);
const body = firstH2 === -1 ? [] : all.slice(firstH2);
if (body[0]) body[0].first = true;

// capa
const title = plain(pre.find((b) => b.type === 'heading' && b.level === 1)?.text ?? 'Mariana');
let tagline = '';
let date = '';
let dateRest = '';
const notes = [];
for (const b of pre) {
  if (b.type !== 'para' && b.type !== 'pend') continue;
  const t = b.text;
  const d = t.match(/^Data de entrega:\s*(\d{2}\/\d{2}\/\d{4})\.?\s*(.*)$/);
  if (!tagline && /^\*\*[^*]+\*\*$/.test(t)) tagline = t.replace(/^\*\*|\*\*$/g, '');
  else if (d) { date = d[1]; dateRest = d[2]; }
  else notes.push(t);
}
const coverLabel = compact ? 'Cabeçalho' : 'Capa';
state.h2 = coverLabel;
const coverNotes = notes.map((t) => `<p>${inline(t, { where: compact ? 'cabeçalho' : 'capa' })}</p>`).join('');
const coverDateRest = dateRest ? inline(dateRest, { where: 'capa, linha da data' }) : '';

// integrantes na capa: lidos da tabela da seção "Integrantes" (as pendências contam só lá)
let members = '';
const iH = body.findIndex((b) => b.type === 'heading' && /integrantes/i.test(b.text));
let iT = null;
for (let k = iH + 1; iH !== -1 && k < body.length; k++) {
  if (body[k].type === 'heading' && body[k].level <= 2) break;
  if (body[k].type === 'table') { iT = body[k]; break; }
}
if (iT && !compact) {
  const nameCol = iT.header.findIndex((h) => /nome/i.test(h));
  const rmCol = iT.header.findIndex((h) => /^\s*rm\s*$/i.test(plain(h)));
  members = iT.rows
    .map((r) => {
      const cell = (c) => (c === -1 ? '' : inline(r[c] ?? '', { record: false }));
      return `<li><span class="m-name">${cell(nameCol)}</span><span class="m-rm">${rmCol === -1 ? '' : `<span class="m-label">RM</span> ${cell(rmCol)}`}</span></li>`;
    })
    .join('');
}

state.h2 = coverLabel;
const bodyHtml = renderBlocks(body);
const tocHtml = (() => {
  const items = [];
  let open = false;
  for (const t of toc) {
    if (t.level === 2) {
      if (open) items.push('</ol></li>');
      const m = t.text.match(/^(\d+)\.\s+(.*)$/);
      items.push(`<li><a href="#${t.id}"><span class="num">${m ? esc(m[1]) : ''}</span>${fmt(m ? m[2] : t.text)}</a><ol>`);
      open = true;
    } else {
      items.push(`<li><a href="#${t.id}">${fmt(t.text)}</a></li>`);
    }
  }
  if (open) items.push('</ol></li>');
  return `<nav class="toc" aria-label="Sumário"><h2 class="toc-title">Sumário</h2><ol>${items.join('').replace(/<ol><\/ol>/g, '')}</ol></nav>`;
})();

const logo = logoSvg();
const header = 'FIAP · Global Solution · CitizenTech';
const topo = (meta.topo || title).replace(/"/g, '');

// documento curto: faixa escura no topo da página 1, sem página de capa
const compactCss = String.raw`
@page :first{@top-left{content:none}@top-right{content:none}}
.masthead{position:relative;background:var(--dark);color:var(--on-dark);border-radius:8px;padding:10pt 16pt 11pt;margin:0 0 12pt;break-inside:avoid}
.masthead::before,.masthead::after{content:"";position:absolute;top:50%;width:11pt;height:11pt;margin-top:-5.5pt;border-radius:50%;background:var(--paper)}
.masthead::before{left:-5.5pt}
.masthead::after{right:-5.5pt}
.masthead .mh-top{display:flex;justify-content:space-between;align-items:center;gap:12pt;margin-bottom:7pt}
.masthead .logo{display:block;width:40mm;height:auto}
.masthead .eyebrow{font-size:7pt;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--brass);margin:0;text-align:right}
.masthead h1{font-family:var(--serif);font-weight:600;font-size:21pt;line-height:1.12;margin:0 0 3pt;color:var(--on-dark)}
.masthead .tagline{font-family:var(--serif);font-weight:400;font-size:11pt;line-height:1.3;margin:0 0 5pt;color:var(--sage)}
.masthead .notes{font-size:8.4pt;line-height:1.45;color:var(--on-dark-muted);border-top:1pt dashed var(--dark-line);padding-top:5pt;margin-top:5pt}
.masthead .notes p{margin:0 0 2pt}
.masthead .notes a{color:var(--sage)}
.masthead .date{color:var(--brass);font-weight:600}
.masthead code{background:var(--dark-2);color:var(--on-dark);border:.5pt solid var(--dark-line)}
.masthead .pend{background:transparent;color:var(--on-dark);border-color:var(--brass)}
h2{font-size:14.5pt;margin-bottom:7pt;padding-top:6pt;border-top-width:2pt}
h3{font-size:11pt;margin:10pt 0 4pt}
`;

const css = String.raw`
${fontFaces()}
:root{
  --ink:${brand.garrafa}; --muted:${brand.paperMuted}; --leaf:${brand.leaf};
  --brass:${brand.brass}; --on-brass:${brand.onBrass}; --brass-ink:#7A4F00; --brass-tint:#FFF3DA;
  --line:#D3DCD6; --tint:#EEF3EF; --zebra:#F7F9F7; --paper:#FFFFFF;
  --dark:${brand.garrafa}; --dark-2:${brand.surface}; --dark-line:${brand.border};
  --on-dark:${brand.textOnDark}; --on-dark-muted:${brand.mutedOnDark}; --sage:${brand.sage};
  --sans:"Instrument Sans",system-ui,"Segoe UI",Arial,sans-serif;
  --serif:Fraunces,Georgia,"Times New Roman",serif;
  --mono:"Cascadia Mono",Consolas,"DejaVu Sans Mono","Segoe UI Symbol",monospace;
}
@page{
  size:A4; margin:21mm 18mm 18mm 18mm;
  @top-left{content:"${topo}";font-family:Fraunces,Georgia,serif;font-weight:600;font-size:9.5pt;color:${brand.leaf};vertical-align:bottom;padding-bottom:3mm}
  @top-right{content:"${header}";font-family:"Instrument Sans",Arial,sans-serif;font-size:7.5pt;letter-spacing:.06em;color:${brand.paperMuted};vertical-align:bottom;padding-bottom:3.4mm}
  @bottom-left{content:"${tagline ? plain(tagline).replace(/"/g, '') : ''}";font-family:"Instrument Sans",Arial,sans-serif;font-size:7pt;color:${brand.paperMuted};vertical-align:top;padding-top:4mm}
  @bottom-right{content:counter(page) " de " counter(pages);font-family:"Instrument Sans",Arial,sans-serif;font-size:8pt;font-weight:600;color:${brand.garrafa};vertical-align:top;padding-top:4mm}
}
${compact ? '' : '@page :first{margin:0;@top-left{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-right{content:none}}'}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:10pt;line-height:1.5;text-rendering:optimizeLegibility;font-kerning:normal}
.doc{width:174mm;margin:0 auto}
p{margin:0 0 7pt;orphans:3;widows:3}
strong{font-weight:600}
a{color:var(--leaf);text-decoration:underline;text-decoration-thickness:.6pt;text-underline-offset:1.5pt}
a.url{overflow-wrap:anywhere;word-break:break-word}
code{font-family:var(--mono);font-size:.84em;background:#E4ECE7;border-radius:2.5px;padding:.2pt 1.6pt;overflow-wrap:anywhere}
code.nb{white-space:nowrap;overflow-wrap:normal}
hr{border:0;border-top:1pt dashed var(--line);margin:14pt 0}

/* títulos: Fraunces, número em latão escuro, fio de latão */
h2,h3,h4{font-family:var(--serif);font-weight:600;color:var(--leaf);break-after:avoid;page-break-after:avoid;break-inside:avoid;line-height:1.2}
h2{font-size:19pt;margin:0 0 12pt;padding-top:8pt;border-top:2.5pt solid var(--brass);break-before:page}
h2.first{break-before:auto}
h3{font-size:12.5pt;color:var(--ink);margin:16pt 0 6pt}
h4{font-size:10.5pt;color:var(--ink);margin:12pt 0 4pt}
h2 .num,h3 .num{color:var(--brass-ink);font-weight:600;margin-right:4pt}
h2 + p,h3 + p{margin-top:0}

ul,ol{margin:0 0 8pt;padding-left:15pt}
li{margin:0 0 3pt;break-inside:avoid}
li::marker{color:var(--brass-ink);font-weight:600}
blockquote{margin:0 0 8pt;padding:4pt 10pt;border-left:2.5pt solid var(--brass);color:var(--muted)}

/* tabelas: cabem em 174 mm, quebram texto, cabeçalho repete na página seguinte */
table{width:100%;border-collapse:collapse;margin:4pt 0 12pt;font-size:8.4pt;line-height:1.38;table-layout:auto}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
th,td{border:.5pt solid var(--line);padding:4pt 5pt;vertical-align:top;text-align:left;overflow-wrap:break-word;hyphens:manual}
th{background:var(--tint);color:var(--leaf);font-weight:600;font-size:8pt;border-bottom:1.5pt solid var(--brass)}
tbody tr:nth-child(even) td{background:var(--zebra)}
td.col-n,th.col-n{width:7mm;text-align:center;white-space:nowrap}
td p{margin:0}
td code{font-size:.9em}

pre.diagram .g{display:inline-block;width:1ch;text-align:center;overflow:visible;line-height:1}
pre.diagram{font-family:var(--mono);font-size:7.6pt;line-height:1.35;background:var(--tint);border:.5pt solid var(--line);border-left:2.5pt solid var(--brass);border-radius:6px;padding:8pt 10pt;margin:4pt 0 12pt;white-space:pre;overflow:hidden;break-inside:avoid;color:var(--ink)}

/* pendências: borda tracejada em latão, rótulo em latão */
.pend{border:1.4pt dashed var(--brass);background:var(--brass-tint);border-radius:6px;color:var(--ink)}
div.pend{display:block;padding:6pt 8pt 6pt;margin:4pt 0 9pt;break-inside:avoid;page-break-inside:avoid}
td div.pend{margin:0;padding:3pt 5pt}
.pend-inline{padding:.5pt 4pt 1pt;-webkit-box-decoration-break:clone;box-decoration-break:clone;line-height:1.9}
.pend-tag{display:inline-block;background:var(--brass);color:var(--on-brass);font-family:var(--sans);font-weight:700;font-size:6.6pt;letter-spacing:.09em;line-height:1.3;padding:1.2pt 4.5pt;border-radius:3px;margin-right:5pt;vertical-align:1pt;white-space:nowrap}
.pend-text{font-weight:500}
.pend-file{display:block;margin-top:4pt;font-size:7.8pt;color:var(--muted)}
.pend-file code{background:#fff}
.gallery{display:flex;flex-wrap:wrap;gap:8pt;align-items:flex-start;margin:6pt 0 12pt}
.gallery > .pend-figure{flex:1 1 80mm;margin:0;min-height:26mm}
.fig-n{font-family:var(--serif);font-weight:600;color:var(--brass-ink)}
figure.shot{margin:0;display:table;width:1px;break-inside:avoid}
figure.shot img{display:block;max-width:174mm;max-height:105mm;width:auto;height:auto;border:.5pt solid var(--line);border-radius:6px}
figure.shot figcaption{display:table-caption;caption-side:bottom;font-size:8pt;line-height:1.35;color:var(--muted);margin-top:3pt}

/* sumário */
.toc-title{border-top:2.5pt solid var(--brass);break-before:auto}
.toc ol{list-style:none;margin:0;padding:0}
.toc > ol{columns:1}
.toc > ol > li{margin:0 0 4pt;break-inside:avoid}
.toc > ol > li > a{font-family:var(--serif);font-weight:600;font-size:11pt;color:var(--ink);text-decoration:none}
.toc .num{display:inline-block;min-width:16pt;color:var(--brass-ink)}
.toc li ol{margin:1pt 0 0 16pt;font-size:8.6pt;line-height:1.45;color:var(--muted)}
.toc li ol li{display:inline;margin:0}
.toc li ol li + li::before{content:" · ";color:var(--brass-ink)}
.toc li ol a{color:var(--muted);text-decoration:none}
.toc{margin-bottom:18pt;padding-bottom:6pt;border-bottom:1pt dashed var(--line)}

/* capa escura com o logo */
.cover{position:relative;width:210mm;height:297mm;overflow:hidden;background:var(--dark);color:var(--on-dark);padding:20mm 20mm 18mm;break-after:page;page-break-after:always;display:flex;flex-direction:column}
.cover .eyebrow{font-size:8.5pt;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--brass);margin:0}
.cover .logo{display:block;width:122mm;height:auto;margin:36mm 0 10mm}
.cover h1.title-text{font-family:var(--serif);font-weight:600;font-size:54pt;margin:36mm 0 8mm;color:var(--on-dark)}
.cover .tagline{font-family:var(--serif);font-weight:400;font-size:19pt;line-height:1.3;max-width:150mm;margin:0 0 12mm;color:var(--on-dark)}
.ticket{position:relative;background:var(--dark-2);border:.6pt solid var(--dark-line);border-radius:8px;padding:9pt 14pt 10pt;display:flex;gap:16pt;align-items:flex-start}
.ticket::before,.ticket::after{content:"";position:absolute;top:50%;width:10pt;height:10pt;margin-top:-5pt;border-radius:50%;background:var(--dark);border:.6pt solid var(--dark-line)}
.ticket::before{left:-5.6pt;clip-path:inset(0 0 0 50%)}
.ticket::after{right:-5.6pt;clip-path:inset(0 50% 0 0)}
.ticket .k{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--on-dark-muted);margin-bottom:2pt}
.ticket .date{font-family:var(--serif);font-weight:600;font-size:22pt;line-height:1;color:var(--brass);white-space:nowrap}
.ticket .rest{font-size:9pt;color:var(--on-dark);padding-left:16pt;border-left:1pt dashed var(--dark-line);align-self:stretch}
.cover .notes{font-size:8.6pt;line-height:1.5;color:var(--on-dark-muted);max-width:150mm;margin-top:8mm}
.cover .notes p{margin:0 0 4pt}
.cover .members{margin-top:auto;border-top:1pt dashed var(--dark-line);padding-top:6mm}
.cover .members h2{all:unset;display:block;font-size:7.5pt;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--brass);margin-bottom:4pt}
.cover .members ol{list-style:none;margin:0;padding:0;columns:1}
.cover .members li{display:flex;gap:10pt;justify-content:space-between;align-items:baseline;border-bottom:.5pt solid var(--dark-line);padding:3.2pt 0;font-size:9.5pt;margin:0}
.cover .members .m-name{flex:1 1 auto}
.cover .members .m-rm{flex:0 0 52mm;text-align:right}
.cover .m-label{font-size:7pt;letter-spacing:.12em;color:var(--on-dark-muted);margin-right:3pt}
.cover .pend{background:transparent;color:var(--on-dark);border-color:var(--brass)}
.cover .pend-inline{line-height:1.85}

@media screen{
  body{background:#DCE2DE;padding:12mm 0}
  .cover,.doc{box-shadow:0 1px 6px rgba(0,0,0,.18)}
  .cover{margin:0 auto 10mm}
  .doc{background:#fff;padding:18mm;width:210mm}
}
${compact ? compactCss : ''}${breakH2 ? '' : 'h2{break-before:auto;margin-top:14pt}\nh2.first{margin-top:0}\n'}`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Global Solution CitizenTech</title>
<style>${css}</style>
</head>
<body>
${compact ? '' : `<section class="cover" aria-label="Capa">
  <p class="eyebrow">${header}</p>
  ${logo ? `${logo}<h1 class="title-text" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0">${esc(title)}</h1>` : `<h1 class="title-text">${esc(title)}</h1>`}
  ${tagline ? `<p class="tagline">${fmt(tagline)}</p>` : ''}
  <div class="ticket">
    <div><span class="k">Entrega</span><span class="date">${esc(date || '⬜')}</span></div>
    ${coverDateRest ? `<div class="rest"><span class="k">Turma e disciplina</span>${coverDateRest}</div>` : ''}
  </div>
  <div class="notes">${coverNotes}</div>
  ${members ? `<div class="members"><h2>Integrantes, em ordem alfabética</h2><ol>${members}</ol></div>` : ''}
</section>
`}<main class="doc">
${compact ? `<header class="masthead">
  <div class="mh-top">${logo ?? ''}<p class="eyebrow">${header}</p></div>
  <h1>${esc(title)}</h1>
  ${tagline ? `<p class="tagline">${fmt(tagline)}</p>` : ''}
  ${coverNotes || date ? `<div class="notes">${coverNotes}${date ? `<p><span class="date">Entrega: ${esc(date)}</span>${coverDateRest ? ` · ${coverDateRest}` : ''}</p>` : ''}</div>` : ''}
</header>` : ''}${showToc ? tocHtml : ''}
${bodyHtml}
</main>
</body>
</html>
`;

if (html.includes('⬜')) console.warn('Aviso: sobrou um marcador ⬜ sem caixa no HTML.');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(htmlOut, html);

// ---------- PDF ----------
let chromium;
try {
  ({ chromium } = requireFromRepo('playwright'));
} catch (e) {
  throw new Error(`Playwright não encontrado a partir de ${repoRoot} (devDependency do pacote web). ${e.message}`);
}
const browser = await chromium.launch();
const warnings = [];
let pages = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.goto(pathToFileURL(htmlOut).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const fontCheck = await page.evaluate(() => ({
    fraunces: document.fonts.check('600 16px Fraunces'),
    instrument: document.fonts.check('400 16px "Instrument Sans"'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
  }));
  if (!fontCheck.fraunces || !fontCheck.instrument) warnings.push(`fonte não carregou: ${JSON.stringify(fontCheck)}`);
  // diagrama largo: reduz a fonte até caber; tabela larga: avisa
  const layout = await page.evaluate(() => {
    const res = [];
    for (const pre of document.querySelectorAll('pre')) {
      let size = parseFloat(getComputedStyle(pre).fontSize);
      while (pre.scrollWidth > pre.clientWidth + 1 && size > 6) pre.style.fontSize = `${(size -= 0.25)}px`;
      if (pre.scrollWidth > pre.clientWidth + 1) res.push('diagrama mais largo que a página');
    }
    const docW = document.querySelector('.doc').clientWidth;
    document.querySelectorAll('table').forEach((t, i) => {
      if (t.scrollWidth > docW + 1) res.push(`tabela ${i + 1} mais larga que a página (${t.scrollWidth}px > ${docW}px)`);
    });
    return res;
  });
  warnings.push(...layout);
  // grava o HTML com o ajuste do diagrama
  const finalHtml = html.replace(/<pre class="diagram">/g, () => '<pre class="diagram">');
  const preSizes = await page.evaluate(() => [...document.querySelectorAll('pre')].map((p) => p.style.fontSize));
  let idx = 0;
  fs.writeFileSync(htmlOut, finalHtml.replace(/<pre class="diagram">/g, () => {
    const s = preSizes[idx++];
    return s ? `<pre class="diagram" style="font-size:${s}">` : '<pre class="diagram">';
  }));
  await page.pdf({
    path: pdfOut,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    outline: true,
    tagged: true,
  });
  const bytes = fs.readFileSync(pdfOut).toString('latin1');
  pages = (bytes.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

  if (capturasOpt) await capturas(browser, capturasOpt);
} finally {
  await browser.close();
}

// ---------- capturas (PNG das páginas do PDF, renderizadas pelo pdf.js do pacote web) ----------
async function capturas(browser, spec) {
  const dir = path.join(outDir, 'capturas');
  fs.mkdirSync(dir, { recursive: true });
  const pdfjsDir = path.join(packageDir('pdfjs-dist'), 'build');
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const files = {
    '/pdf.mjs': [path.join(pdfjsDir, 'pdf.mjs'), 'text/javascript'],
    '/pdf.worker.mjs': [path.join(pdfjsDir, 'pdf.worker.mjs'), 'text/javascript'],
    '/doc.pdf': [pdfOut, 'application/pdf'],
  };
  await page.route('https://captura.local/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:#888"></body>' });
    const f = files[p];
    return f ? route.fulfill({ contentType: f[1], body: fs.readFileSync(f[0]) }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('https://captura.local/');
  const result = await page.evaluate(async (spec) => {
    const pdfjs = await import('/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
    const doc = await pdfjs.getDocument('/doc.pdf').promise;
    const n = doc.numPages;
    const wanted = spec === 'todas' || spec === 'true'
      ? Array.from({ length: n }, (_, i) => i + 1)
      : spec.split(',').map((s) => parseInt(s, 10)).filter((k) => k >= 1 && k <= n);
    const render = async (k, scale) => {
      const p = await doc.getPage(k);
      const vp = p.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
      return c;
    };
    const shots = [];
    for (const k of wanted) shots.push({ k, data: (await render(k, 1.6)).toDataURL('image/png') });
    // visão geral: todas as páginas pequenas numa grade
    const cols = 6;
    const thumbs = [];
    for (let k = 1; k <= n; k++) thumbs.push(await render(k, 0.36));
    const w = thumbs[0].width, h = thumbs[0].height, gap = 10;
    const sheet = document.createElement('canvas');
    sheet.width = cols * (w + gap) + gap;
    sheet.height = Math.ceil(n / cols) * (h + gap + 14) + gap;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#8a8f8c';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.font = '11px sans-serif';
    thumbs.forEach((t, i) => {
      const x = gap + (i % cols) * (w + gap);
      const y = gap + Math.floor(i / cols) * (h + gap + 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(i + 1), x, y + 10);
      ctx.drawImage(t, x, y + 14);
    });
    return { n, shots, sheet: sheet.toDataURL('image/png') };
  }, String(spec));
  for (const s of result.shots) {
    fs.writeFileSync(path.join(dir, `pagina-${String(s.k).padStart(2, '0')}.png`), Buffer.from(s.data.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(dir, 'visao-geral.png'), Buffer.from(result.sheet.split(',')[1], 'base64'));
  console.log(`Capturas: ${result.shots.length} página(s) e visao-geral.png em ${dir} (o pdf.js contou ${result.n} páginas)`);
  await page.close();
}

// ---------- relatório ----------
const rel = (p) => path.relative(process.cwd(), p) || p;
console.log(`HTML: ${rel(htmlOut)}`);
console.log(`PDF:  ${rel(pdfOut)}`);
console.log(`Páginas: ${pages}`);
for (const w of warnings) console.warn(`Aviso: ${w}`);
if (state.pend.length === 0) {
  console.log('Pendências: nenhuma.');
} else {
  console.log(`\nPendências que ainda existem (${state.pend.length}):`);
  for (const p of state.pend) {
    const where = p.where && p.where !== 'parágrafo' ? ` (${p.where})` : '';
    console.log(`  [${LABEL[p.kind]}] ${p.section}${where}: ${p.text}`);
  }
}
