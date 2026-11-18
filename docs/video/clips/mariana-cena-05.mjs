// mariana-cena-05.mp4: "Visto" e "Estou indo" (cena 5 do roteiro). O pedido dela já foi feito
// antes de gravar; na gravação, o Diego abre o alerta (Visto sozinho) e toca em "Estou indo".
import { cond } from '../lib/actions.mjs';
import { alarmEvents, beepEvents } from '../lib/sounds.mjs';
import { herRequest, inClip, TRIO_PANES, visibleButton, waitInitial, waitSoundGap } from '../lib/trio.mjs';

let before = null; // instantes (Date.now) do pedido, feito no ready()

export const clip = {
  file: 'mariana-cena-05.mp4',
  scene: '5, Visto e "Estou indo" (0:52 a 1:08)',
  summary: 'O Diego abre o alerta, que vira "Visto" sozinho e cala o bipe; toca em "Estou indo"; a página dela e o painel mostram que ele está indo.',
  speech: [
    'A equipe toca em "Estou indo". No app, o estado muda com uma transição curta, que confirma o toque e mostra o que mudou. Na página dela: "Diego, de camisa preta, está indo até você". Ele diz a palavra-código dela.',
  ],
  notes: [
    'O pedido dela foi feito antes de o clipe começar (o mesmo pedido da cena 4 numa tomada à parte). Por isso o clipe já abre com o alerta novo pulsando e o painel bipando.',
    'Os bipes do painel seguem o relógio do alerta, que começou antes do clipe: o primeiro bipe dentro do clipe não cai no zero. O alarme do app já tinha tocado e terminado antes do clipe; ao abrir o detalhe, o app marca "Visto" sozinho e o alarme daquele alerta pararia ali.',
    'Motion 2: ao tocar em "Estou indo", os trechos do estado enchem e a linha do estado entra subindo. O toque háptico do celular não existe no navegador.',
    'O cartão do painel acende (Motion 3) quando vira "Visto" e quando vira "A caminho".',
    'O som é montado a partir do registro (o bipe segue o código do painel), não gravado do navegador. O alarme calando ao abrir o alerta só se ouve no celular de verdade: tomada do grupo, se quiserem.',
  ],
  preset: 'trio',
  panes: TRIO_PANES,
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: true,
  async ready(ctx) {
    await waitInitial(ctx);
    await ctx.page.frameLocator('#painel').getByRole('button', { name: 'Alarme ligado' }).waitFor({ timeout: 20_000 });
    before = await herRequest(ctx);
    await waitSoundGap(before);
  },
  async run({ page, frames, act, rec }) {
    const app = page.frameLocator('#app');
    const { tap, pause, when, mark } = act;
    const tAlarm = rec.clipMs(before.appWall);
    const tBeep = rec.clipMs(before.panelWall);
    mark('todas', 'Início: o pedido dela já está na tela; no app e no painel o alerta novo pulsa, e o painel bipa', undefined, 'A equipe toca em "Estou indo".');
    const card = visibleButton(app, /Banheiro feminino/);
    await tap(card, { tela: 'app', evento: 'Diego toca no cartão do alerta: o detalhe abre' });
    const [tSeenPanel, tSeenApp] = await Promise.all([
      when(frames.painel, cond.noSelector, '.panel-alarm-ringing', { tela: 'painel', evento: 'Cartão em "Visto; ninguém foi mandado ainda" (acende); o bipe para' }),
      when(frames.app, cond.text, 'Visto; ninguém foi ainda', { tela: 'app', evento: 'Detalhe em "Visto", sozinho, com o tempo "há ..." correndo e "Diga esta palavra a ela"' }),
      when(frames.ela, cond.text, 'A equipe viu o seu pedido', { tela: 'ela', evento: '"A equipe viu o seu pedido"; a linha do tempo marca "A equipe viu"' }),
    ]);
    await pause(3500);
    await tap(visibleButton(app, 'Estou indo'), { tela: 'app', evento: 'Toca em "Estou indo": os trechos enchem e a linha do estado entra subindo', fala: 'No app, o estado muda com uma transição curta, que confirma o toque e mostra o que mudou.' });
    await Promise.all([
      when(frames.ela, cond.text, 'Diego, de camisa preta, está indo até você', { tela: 'ela', evento: '"Alguém está indo até você" e "Diego, de camisa preta, está indo até você."', fala: 'Na página dela: "Diego, de camisa preta, está indo até você". Ele diz a palavra-código dela.' }),
      when(frames.painel, cond.text, 'está indo até ela', { tela: 'painel', evento: 'Cartão em "A caminho" (acende): "Diego Santos está indo até ela"' }),
    ]);
    await pause(7000);
    mark('todas', 'Fim');
    return { sounds: inClip([...alarmEvents(tAlarm, tSeenApp), ...beepEvents(tBeep, tSeenPanel)]) };
  },
};
