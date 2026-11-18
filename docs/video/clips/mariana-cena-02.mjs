// mariana-cena-02.mp4: a solução. Logo e as três partes (página dela, app da equipe, painel) com setas.
import { cardClip } from '../lib/cards.mjs';

const phone = `<svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true"><rect x="13" y="4" width="22" height="40" rx="5" fill="none" stroke="#A8D5B8" stroke-width="3"/><line x1="21" y1="38" x2="27" y2="38" stroke="#A8D5B8" stroke-width="3" stroke-linecap="round"/></svg>`;
const screen = `<svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true"><rect x="4" y="8" width="40" height="26" rx="4" fill="none" stroke="#A8D5B8" stroke-width="3"/><line x1="17" y1="42" x2="31" y2="42" stroke="#A8D5B8" stroke-width="3" stroke-linecap="round"/><line x1="24" y1="34" x2="24" y2="42" stroke="#A8D5B8" stroke-width="3"/></svg>`;
const arrow = (n) =>
  `<svg class="arrow" viewBox="0 0 120 40" width="120" height="40" aria-hidden="true"><path class="draw draw-${n}" d="M6 20 H104 M90 8 L106 20 L90 32" fill="none" stroke="#FFB840" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const box = (n, icon, title, text) =>
  `<div class="part in in-${n}">${icon}<div class="part-title">${title}</div><div class="part-text">${text}</div></div>`;

export const clip = cardClip({
  file: 'mariana-cena-02.mp4',
  scene: '2, Solução (0:13 a 0:27)',
  summary: 'Cartela da solução: o logo da Mariana e as três partes, página dela, app da equipe e painel, ligadas por setas.',
  speech: [
    'Esta é a Mariana. A mulher lê o QR code do local e pede ajuda pela web, sem login e sem instalar nada. A equipe recebe no app. A gerência vê tudo no painel.',
  ],
  notes: [
    'Dizer "Mariana" sem sobrenome (decisão do projeto). O logo é o de web/public/brand/logo-negativo.svg.',
    'As setas se desenham da esquerda para a direita, na ordem da jornada: o pedido dela vai para o app e para o painel.',
  ],
  css: `
.c2{display:flex;flex-direction:column;align-items:center;gap:90px}
.c2 .logo{width:560px;height:auto}
.c2 .row{display:flex;align-items:center;gap:22px}
.c2 .part{width:400px;height:310px;box-sizing:border-box;padding:34px 30px;border-radius:8px;background:#16201B;border:2px solid #33433A;
 display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.c2 .part-title{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:40px;color:#EEEBE1}
.c2 .part-text{font-size:25px;font-weight:500;line-height:1.4;color:#A9B3AA}
.c2 .draw{stroke-dasharray:180;stroke-dashoffset:180;transition:stroke-dashoffset .7s ease-out}
body.s3 .draw-1,body.s4 .draw-2{stroke-dashoffset:0}
`,
  html: `<div class="c2">
  <img class="logo in in-1" src="/assets/logo-negativo.svg" alt="Mariana">
  <div class="row">
    ${box(2, phone, 'Página dela', 'Lê o QR code do local e pede ajuda pela web. Sem login, sem instalar nada.')}
    ${arrow(1)}
    ${box(3, phone, 'App da equipe', 'Recebe o alerta, com alarme, e vai até ela.')}
    ${arrow(2)}
    ${box(4, screen, 'Painel da gerência', 'Vê tudo ao vivo.')}
  </div>
</div>`,
  steps: [
    { hold: 1800, evento: 'Entra o logo da Mariana', fala: 'Esta é a Mariana.' },
    { hold: 3200, evento: 'Entra a primeira parte: "Página dela"', fala: 'A mulher lê o QR code do local e pede ajuda pela web, sem login e sem instalar nada.' },
    { hold: 2600, evento: 'A seta se desenha e entra "App da equipe"', fala: 'A equipe recebe no app.' },
    { hold: 7500, evento: 'A segunda seta se desenha e entra "Painel da gerência". A cartela fica parada até o fim', fala: 'A gerência vê tudo no painel.' },
  ],
});
