// mariana-cena-04.mp4: o pedido e o alarme (cena 4 do roteiro). Ela toca em "Estou me sentindo
// insegura"; o alerta chega ao app (alarme) e ao painel (bipe) e pulsa. Termina antes de o Diego abrir.
import { cond } from '../lib/actions.mjs';
import { alarmEvents, beepEvents } from '../lib/sounds.mjs';
import { TRIO_PANES, waitInitial } from '../lib/trio.mjs';

export const clip = {
  file: 'mariana-cena-04.mp4',
  scene: '4, Pedido e alarme (0:35 a 0:52)',
  summary: 'Ela toca em "Estou me sentindo insegura" e recebe a palavra-código; o app toca o alarme e o painel bipa; o alerta novo pulsa nas duas telas.',
  speech: [
    'Ela lê o QR code e toca em "Estou me sentindo insegura". Recebe uma palavra-código. No app, o alarme toca. O alerta novo pulsa até alguém ver: o pulso diz que ninguém atendeu ainda.',
  ],
  notes: [
    'Motion 1: o pulso do alerta novo, no app e no painel. Roda do toque até o fim do clipe (mais que os 3 a 4 s pedidos; a edição corta).',
    'O clipe termina com o alerta ainda novo: o painel continua bipando a cada 2,5 s até o último quadro, como faria de verdade. O alarme do app toca uma vez (o arquivo inteiro, 2,9 s); a repetição seria aos 20 s do alerta, depois do fim do clipe.',
    'Aqui ela abre o link direto, sem ler o QR code de verdade: a leitura do cartaz impresso (/painel/qr-codes/imprimir) é filmada pelo grupo no celular, se quiserem.',
    'O som é montado a partir do registro: o alarme é o arquivo do app (mobile/assets/sounds/mariana_alarme.wav), no instante em que o alerta apareceu no app, e o bipe segue o código do painel. Não é o som gravado do navegador: no navegador (Expo web) o app não toca o alarme; quem toca é o app instalado no celular.',
    'Tomada do grupo no celular, não gravada aqui: o alarme com o app fechado e a tela bloqueada, com a notificação na tela. O PC não grava isso, e o clipe não simula.',
  ],
  preset: 'trio',
  panes: TRIO_PANES,
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: true,
  async ready(ctx) {
    await waitInitial(ctx);
    await ctx.page.frameLocator('#painel').getByRole('button', { name: 'Alarme ligado' }).waitFor({ timeout: 20_000 });
  },
  async run({ page, frames, act }) {
    const ela = page.frameLocator('#ela');
    const { tap, pause, when, mark } = act;
    mark('todas', 'Início: as três telas no estado inicial', undefined, 'Ela lê o QR code e toca em "Estou me sentindo insegura".');
    await pause(3000);
    await tap(ela.getByRole('button', { name: /Estou me sentindo insegura/ }), { tela: 'ela', evento: 'Toca em "Estou me sentindo insegura"', pauseMs: 0 });
    const [, tApp, tPanel] = await Promise.all([
      when(frames.ela, cond.text, 'Sua palavra-código', { tela: 'ela', evento: '"Pedido enviado à equipe", com "Sua palavra-código:" e a palavra grande; a linha do tempo marca "Pedido enviado"', fala: 'Recebe uma palavra-código.' }),
      when(frames.app, cond.text, '1 alerta', { tela: 'app', evento: 'Alerta novo na lista ("1 alerta em aberto"), em latão, pulsando; o alarme toca', fala: 'No app, o alarme toca.' }),
      when(frames.painel, cond.selector, '.panel-alarm-ringing', { tela: 'painel', evento: 'Cartão novo, em latão, "Ninguém viu ainda", pulsando; o painel bipa' }),
    ]);
    await pause(4500);
    mark('todas', 'O alerta segue pulsando no app e no painel: ninguém viu ainda', undefined, 'O alerta novo pulsa até alguém ver: o pulso diz que ninguém atendeu ainda.');
    await pause(9000);
    const end = mark('todas', 'Fim (o alerta continua novo)');
    return { sounds: [...alarmEvents(tApp, end), ...beepEvents(tPanel, end)] };
  },
};
