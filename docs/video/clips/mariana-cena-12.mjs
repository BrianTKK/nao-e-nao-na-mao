// mariana-cena-12.mp4: o fecho. Logo, links do site e do repositório, e o espaço vazio para o
// nome do grupo e os nomes dos integrantes, que entram na edição (cena 12).
import { cardClip } from '../lib/cards.mjs';

export const clip = cardClip({
  file: 'mariana-cena-12.mp4',
  scene: '12, Fecho (2:39 a 2:47)',
  summary: 'Cartela de fecho: o logo da Mariana, os links do site e do repositório, e o espaço vazio para o nome do grupo e os integrantes.',
  speech: ['Mariana: pedir ajuda sem dar na vista, e a equipe vai até você. Repositório e site na descrição.'],
  notes: [
    'Espaço vazio de propósito, para a edição: nome do grupo na faixa de y = 410 a 500 px (centrada, largura toda); nomes dos integrantes na faixa de y = 720 a 960 px. Nenhum texto do clipe passa por essas faixas.',
    'Links copiados do roteiro: site https://naoenao.obrian.me e repositório https://github.com/BrianTKK/nao-e-nao-na-mao. A descrição do vídeo deve ter os dois links no ar.',
  ],
  css: `
.c12{position:absolute;inset:0}
.c12 .logo{position:absolute;left:50%;top:220px;width:700px;margin-left:-350px;height:auto}
.c12 .links{position:absolute;left:0;right:0;top:545px;display:flex;flex-direction:column;align-items:center;gap:18px}
.c12 .link{font-size:34px;font-weight:500;color:#EEEBE1}
.c12 .link b{font-weight:600;color:#A8D5B8;margin-right:14px}
`,
  html: `<div class="c12">
  <img class="logo in in-1" src="/assets/logo-negativo.svg" alt="Mariana">
  <div class="links">
    <div class="link in in-2"><b>Site</b>https://naoenao.obrian.me</div>
    <div class="link in in-2"><b>Repositório</b>https://github.com/BrianTKK/nao-e-nao-na-mao</div>
  </div>
</div>`,
  steps: [
    { hold: 1800, evento: 'Entra o logo da Mariana', fala: 'Mariana: pedir ajuda sem dar na vista, e a equipe vai até você.' },
    { hold: 9000, evento: 'Entram os links do site e do repositório. As faixas do nome do grupo e dos integrantes ficam vazias até o fim', fala: 'Repositório e site na descrição.' },
  ],
});
