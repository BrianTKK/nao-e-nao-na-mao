#!/usr/bin/env node
/**
 * Junta as folhas de marcação (docs/video/marcacao/*.md) num só Markdown,
 * docs/video/Folhas_de_Marcacao.md: a integração e depois as cenas 1 a 12.
 *
 *   node docs/video/juntar-folhas.mjs
 *   node docs/pdf/build-pdf.mjs --in=docs/video/Folhas_de_Marcacao.md --out-dir=docs/video --nome=Mariana_Folhas_de_Marcacao
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const order = [
  'mariana-integracao',
  ...Array.from({ length: 12 }, (_, i) => `mariana-cena-${String(i + 1).padStart(2, '0')}`),
];

const out = [
  '<!-- pdf: capa=compacta; quebra=sim; topo=Mariana · Folhas de marcação dos clipes -->',
  '',
  '# Folhas de marcação dos clipes',
  '',
  '**Os 13 clipes, segundo a segundo: o que aparece na tela, o som e a fala de cada momento**',
  '',
  'Uma folha por clipe, na ordem: a integração e depois as cenas 1 a 12. Os tempos saem do registro da gravação (minuto:segundo.décimo, desde o início do clipe). Os clipes vêm sem voz: fora do alarme e do bipe listados, o áudio é silêncio. As falas são as do PDF do vídeo-pitch.',
  '',
];

for (const name of order) {
  const file = path.join(dir, 'marcacao', `${name}.md`);
  let text = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  // cada folha desce um nível: o # dela vira ## (uma seção por clipe)
  text = text.replace(/^(#{1,5}) /gm, (_, h) => `#${h} `);
  text = text.replace(/^## Folha de marcação: (.*)$/m, '## $1');
  text = text.replace(/^(\| Tempo \| Onde \|)/m, '<!-- colunas: 9%, 13%, 38%, 20%, 20% -->\n$1');
  out.push(text.trim(), '');
}

const target = path.join(dir, 'Folhas_de_Marcacao.md');
fs.writeFileSync(target, out.join('\n'));
console.log(`${order.length} folhas em ${path.relative(process.cwd(), target)}`);
