// mariana-cena-11.mp4: lei e ODS. Duas cartelas seguidas com o texto do roteiro (cena 11).
import { cardClip } from '../lib/cards.mjs';

export const clip = cardClip({
  file: 'mariana-cena-11.mp4',
  scene: '11, Lei e ODS (2:21 a 2:39)',
  summary: 'Duas cartelas: a lei paulista 17.621/2023 (art. 2º, §2º) e as metas 5.2 e 11.7 dos ODS, com o texto oficial e os links.',
  speech: [
    'A lei paulista 17.621, de 2023, permite outros mecanismos de comunicação entre a mulher e o estabelecimento, e o nosso QR code se encaixa aí. Contribui para o ODS 5, meta 5.2, e o ODS 11, meta 11.7: bares mais seguros para as mulheres.',
  ],
  notes: [
    'Textos copiados do roteiro, sem mudança: a cartela da lei usa o resumo do roteiro; as metas usam o texto oficial da ONU (seção "Fontes das afirmações").',
    '"O nosso QR code se encaixa aí" é leitura do grupo, não do texto da lei: fica só na fala, não na cartela.',
    'A meta 11.7 fala em espaços públicos; bar é espaço privado de uso público, então a ligação é por analogia. Não precisa estar na fala; está no PDF.',
    'Não citar "Procon exige relatório", "bar é obrigado pela lei federal 14.786" nem "registro que a lei pede".',
  ],
  css: `
.c11{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.c11 .sheet{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:0 170px;text-align:center}
.c11 .kicker{font-size:26px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#A8D5B8}
.c11 .card-title{font-size:66px}
.c11 .card-text{font-size:40px;max-width:1350px}
.c11 .card-small{font-size:24px}
.c11 .cols{display:flex;gap:60px;align-items:stretch}
.c11 .goal{width:700px;box-sizing:border-box;padding:40px 44px;border-radius:8px;background:#16201B;border:2px solid #33433A;text-align:left;display:flex;flex-direction:column;gap:18px}
.c11 .goal-title{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:48px;color:#FFB840}
.c11 .goal-text{font-size:27px;font-weight:500;line-height:1.45;color:#EEEBE1}
.c11 .goal-link{margin-top:auto;font-size:21px;font-weight:500;color:#A9B3AA}
`,
  html: `<div class="c11">
  <div class="sheet out out-3">
    <div class="kicker in in-1">Lei estadual (SP)</div>
    <div class="card-title in in-1">17.621/2023, art. 2º, §2º</div>
    <div class="card-text in in-2">outros mecanismos de comunicação entre a mulher e o estabelecimento</div>
    <div class="card-small in in-2">https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17621-03.02.2023.html</div>
  </div>
  <div class="sheet">
    <div class="kicker in in-4">Objetivos de Desenvolvimento Sustentável</div>
    <div class="cols">
      <div class="goal in in-4">
        <div class="goal-title">ODS 5, meta 5.2</div>
        <div class="goal-text">Eliminar todas as formas de violência contra todas as mulheres e meninas nas esferas públicas e privadas, incluindo o tráfico e exploração sexual e de outros tipos</div>
        <div class="goal-link">https://brasil.un.org/pt-br/sdgs/5</div>
      </div>
      <div class="goal in in-5">
        <div class="goal-title">ODS 11, meta 11.7</div>
        <div class="goal-text">Até 2030, proporcionar o acesso universal a espaços públicos seguros, inclusivos, acessíveis e verdes, particularmente para as mulheres e crianças, pessoas idosas e pessoas com deficiência</div>
        <div class="goal-link">https://brasil.un.org/pt-br/sdgs/11</div>
      </div>
    </div>
  </div>
</div>`,
  steps: [
    { hold: 1500, evento: 'Cartela 1: entra "Lei estadual (SP) 17.621/2023, art. 2º, §2º"', fala: 'A lei paulista 17.621, de 2023,' },
    { hold: 6500, evento: 'Entra o texto "outros mecanismos de comunicação entre a mulher e o estabelecimento" e o link', fala: 'permite outros mecanismos de comunicação entre a mulher e o estabelecimento, e o nosso QR code se encaixa aí.' },
    { hold: 700, evento: 'A cartela da lei sai' },
    { hold: 2800, evento: 'Cartela 2: entra "ODS 5, meta 5.2", com o texto oficial e o link', fala: 'Contribui para o ODS 5, meta 5.2,' },
    { hold: 8000, evento: 'Entra "ODS 11, meta 11.7", com o texto oficial e o link. A cartela fica parada até o fim', fala: 'e o ODS 11, meta 11.7: bares mais seguros para as mulheres.' },
  ],
});
