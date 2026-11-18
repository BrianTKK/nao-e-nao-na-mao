// mariana-cena-01.mp4: o problema. Cartela com "11,3%" grande e a fonte pequena (cena 1 do roteiro).
import { cardClip } from '../lib/cards.mjs';

export const clip = cardClip({
  file: 'mariana-cena-01.mp4',
  scene: '1, Problema (0:00 a 0:13)',
  summary: 'Cartela do problema: "11,3%" grande, a frase da pesquisa e a fonte pequena.',
  speech: [
    'Pesquisa de 2025: 11,3% das mulheres relataram abordagem agressiva numa festa. Pedir ajuda em voz alta, no bar, expõe quem pede. Ela quer sair, ou só falar com alguém, sem escândalo.',
  ],
  notes: [
    'Números e fonte copiados do roteiro, sem mudança. O número é nacional e de "festa", não de bar: na fala, não dizer "em bares".',
    'O roteiro prevê, depois da cartela, uma imagem do bar ou da equipe do grupo no local (só se for do grupo; sem foto de banco). Essa imagem não está no clipe: entra na edição.',
    'Fonte da pesquisa: https://forumseguranca.org.br/wp-content/uploads/2025/03/visiveleinvisivel-2025-infografico.pdf',
  ],
  css: `
.c1{display:flex;flex-direction:column;align-items:center;gap:26px}
.c1 .card-big{font-size:220px;letter-spacing:-.01em}
.c1 .card-title{font-size:58px;max-width:1300px}
.c1 .card-small{margin-top:40px;font-size:26px}
.c1 .rule{width:120px;height:4px;border-radius:2px;background:#A8D5B8;margin:6px 0 4px}
`,
  html: `<div class="c1">
  <div class="card-big in in-1">11,3%</div>
  <div class="card-title in in-2">das mulheres relataram abordagem agressiva numa festa</div>
  <div class="rule in in-3"></div>
  <div class="card-small in in-3">Fonte: Fórum Brasileiro de Segurança Pública e Datafolha, Visível e Invisível, 5ª edição, 2025</div>
</div>`,
  steps: [
    { hold: 1600, evento: '"11,3%" entra, grande, em latão', fala: 'Pesquisa de 2025: 11,3% das mulheres relataram abordagem agressiva numa festa.' },
    { hold: 2400, evento: 'Entra "das mulheres relataram abordagem agressiva numa festa"' },
    { hold: 11000, evento: 'Entra a fonte, pequena. A cartela fica parada até o fim', fala: 'Pedir ajuda em voz alta, no bar, expõe quem pede. Ela quer sair, ou só falar com alguém, sem escândalo.' },
  ],
});
