// mariana-cena-03.mp4: as três telas paradas, no estado inicial (cena 3 do roteiro).
import { TRIO_PANES, waitInitial } from '../lib/trio.mjs';

export const clip = {
  file: 'mariana-cena-03.mp4',
  scene: '3, Três telas, início (0:27 a 0:35)',
  summary: 'As três telas paradas no estado inicial: a página dela no QR do banheiro feminino, o app em "Nenhum alerta agora" e o painel sem alertas.',
  speech: ['Agora, ao vivo, três telas ao mesmo tempo: a web dela, o app da equipe e o painel da gerência.'],
  notes: [
    'Ordem das telas: dela à esquerda, equipe no centro, painel à direita, na ordem da jornada.',
    'Sem toque e sem som: o clipe só apresenta as telas. O pedido começa no clipe da cena 4.',
    'A página dela é a do QR do banheiro feminino do bar de demonstração (/q/ESQBF7K2).',
  ],
  preset: 'trio',
  panes: TRIO_PANES,
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: true,
  async ready(ctx) {
    await waitInitial(ctx);
    await ctx.page.frameLocator('#painel').getByRole('button', { name: 'Alarme ligado' }).waitFor({ timeout: 20_000 });
  },
  async run({ act }) {
    act.mark('todas', 'Início: página dela no QR do banheiro feminino; app em "Nenhum alerta agora"; painel com "Nenhum alerta em aberto." e o alarme ligado', undefined, 'Agora, ao vivo, três telas ao mesmo tempo:');
    await act.pause(3000);
    act.mark('ela', 'Página dela, parada no início do pedido', undefined, 'a web dela,');
    await act.pause(2500);
    act.mark('app', 'App da equipe: lista vazia, "Nenhum alerta agora"', undefined, 'o app da equipe');
    await act.pause(2500);
    act.mark('painel', 'Painel: quadro ao vivo, "Nenhum alerta em aberto."', undefined, 'e o painel da gerência.');
    await act.pause(3000);
    act.mark('todas', 'Fim');
    return { sounds: [] };
  },
};
