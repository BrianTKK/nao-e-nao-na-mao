// mariana-cena-07.mp4: encerrar (cena 7 do roteiro). O alerta já está em "A caminho" quando o
// clipe começa; o Diego toca em "Encerrar…", escolhe o desfecho, e o pedido se encerra nas três telas.
import { cond } from '../lib/actions.mjs';
import { herRequest, TRIO_PANES, visibleButton, waitInitial, waitText } from '../lib/trio.mjs';

export const clip = {
  file: 'mariana-cena-07.mp4',
  scene: '7, Encerrar (1:18 a 1:32)',
  summary: 'A partir de "A caminho": o Diego toca em "Encerrar…" e escolhe o desfecho; a página dela chega a "Pedido encerrado" e o painel fica sem alertas.',
  speech: [
    'Ele diz a palavra-código a ela e encerra, escolhendo o desfecho. A linha do tempo dela avança devagar, de propósito: a tela não deve chamar atenção.',
  ],
  notes: [
    'O pedido, o "Visto" e o "Estou indo" foram feitos antes de o clipe começar: o clipe abre em "A caminho" nas três telas.',
    'O encontro de verdade (quem faz a equipe dizendo a palavra em voz baixa à mulher) não é tela: o grupo filma à parte, se quiser.',
    'Motion 4: na página dela, só o passo atual faz um carimbo; os anteriores ficam com o check. Nada mais se mexe.',
    'Sem som: o alarme e o bipe tocaram antes do clipe e pararam quando o alerta foi visto.',
  ],
  preset: 'trio',
  panes: TRIO_PANES,
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: true,
  async ready(ctx) {
    const { page, frames } = ctx;
    await waitInitial(ctx);
    await herRequest(ctx);
    const app = page.frameLocator('#app');
    await visibleButton(app, /Banheiro feminino/).click();
    await waitText(frames.app, 'Visto; ninguém foi ainda');
    await visibleButton(app, 'Estou indo').click();
    await Promise.all([waitText(frames.painel, 'está indo até ela'), waitText(frames.ela, 'está indo até você')]);
    await new Promise((r) => setTimeout(r, 2500)); // as transições terminam antes de gravar
  },
  async run({ page, frames, act }) {
    const app = page.frameLocator('#app');
    const { tap, pause, when, mark } = act;
    mark('todas', 'Início: "A caminho" nas três telas; a página dela diz "Diego, de camisa preta, está indo até você"', undefined, 'Ele diz a palavra-código a ela e encerra,');
    await tap(visibleButton(app, /Encerrar/), { tela: 'app', evento: 'Toca em "Encerrar…": abre a folha de desfechos', pauseMs: 2500 });
    await tap(visibleButton(app, /Acompanhei até um lugar seguro/), { tela: 'app', evento: 'Escolhe "Acompanhei até um lugar seguro ou até o carro"', pauseMs: 2500, fala: 'escolhendo o desfecho.' });
    await Promise.all([
      when(frames.ela, cond.text, 'Pedido encerrado', { tela: 'ela', evento: '"Pedido encerrado": a linha do tempo chega a "Encerrado" (o último passo faz o carimbo; os anteriores ficam com o check)', fala: 'A linha do tempo dela avança devagar, de propósito: a tela não deve chamar atenção.' }),
      when(frames.painel, cond.text, 'Nenhum alerta em aberto.', { tela: 'painel', evento: 'O cartão sai do quadro: "Nenhum alerta em aberto."' }),
    ]);
    await pause(8500);
    mark('todas', 'Fim');
    return { sounds: [] };
  },
};
