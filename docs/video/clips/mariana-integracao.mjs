// mariana-integracao.mp4: as três telas lado a lado, numa tomada só (cenas 3 a 7 do roteiro).
// Ela pede ajuda pelo QR code do banheiro feminino; o alerta chega ao app e ao painel; o Diego
// abre (Visto), toca em "Estou indo" (A caminho) e encerra com um desfecho.
import { API, APP } from '../lib/env.mjs';
import { cond } from '../lib/actions.mjs';
import { alarmEvents, beepEvents } from '../lib/sounds.mjs';

export const clip = {
  file: 'mariana-integracao.mp4',
  summary: 'As três telas em sincronia: o pedido dela, o alarme e o atendimento no app, o painel acompanhando até o encerramento.',
  scene: '3 a 7, numa tomada só (0:27 a 1:32)',
  speech: [
    'Cena 3: "Agora, ao vivo, três telas ao mesmo tempo: a web dela, o app da equipe e o painel da gerência."',
    'Cena 4: "Ela lê o QR code e toca em "Estou me sentindo insegura". Recebe uma palavra-código. No app, o alarme toca. O alerta novo pulsa até alguém ver: o pulso diz que ninguém atendeu ainda."',
    'Cena 5: "A equipe toca em "Estou indo". No app, o estado muda com uma transição curta, que confirma o toque e mostra o que mudou. Na página dela: "Diego, de camisa preta, está indo até você". Ele diz a palavra-código dela."',
    'Cena 6: "No painel, o tempo corre. O cartão acende a cada mudança de estado, para a gerência ver o que mudou."',
    'Cena 7: "Ele diz a palavra-código a ela e encerra, escolhendo o desfecho. A linha do tempo dela avança devagar, de propósito: a tela não deve chamar atenção."',
  ],
  notes: [
    'A tomada única do roteiro tem 1 min 5 s de fala; este clipe tem cerca de 46 s de tela. Para dublar as cenas 3 a 7 numa tomada só, a edição estica as pausas (os trechos parados) ou usa os clipes por cena, mariana-cena-03 a mariana-cena-07, que têm a folga de cada cena.',
    'O som é montado a partir do registro: o alarme é o arquivo do app e o bipe segue o código do painel. Não é o som gravado do navegador.',
  ],
  preset: 'trio',
  panes: [
    { id: 'ela', url: `${API}/q/ESQBF7K2`, label: 'Página dela, pelo QR code' },
    { id: 'app', url: APP, label: 'App da equipe' },
    { id: 'painel', url: `${API}/painel`, label: 'Painel da gerência', title: 'Painel do bar' },
  ],
  sessions: { app: 'diego', panel: 'marta' },
  panelAlarm: true,

  /** Tudo carregado e no estado inicial, antes de a gravação começar. */
  async ready({ page, frames }) {
    const ela = page.frameLocator('#ela');
    const app = page.frameLocator('#app');
    const painel = page.frameLocator('#painel');
    await ela.getByRole('button', { name: /Estou me sentindo insegura/ }).waitFor({ timeout: 60_000 });
    await app.getByText('Nenhum alerta agora').first().waitFor({ timeout: 240_000 });
    await painel.getByText('Nenhum alerta em aberto.').waitFor({ timeout: 60_000 });
    await painel.getByRole('button', { name: 'Alarme ligado' }).waitFor({ timeout: 20_000 });
    for (const f of Object.values(frames)) await f.evaluate(() => document.fonts.ready).catch(() => {});
  },

  async run({ page, frames, act }) {
    const ela = page.frameLocator('#ela');
    const app = page.frameLocator('#app');
    const painel = page.frameLocator('#painel');
    const { tap, pause, when, mark } = act;

    // Cursor parado no painel, à direita do título "Visão geral": o único canto que fica vazio
    // em todos os estados (o quadro dos alertas cresce e encolhe abaixo dele).
    const box = await page.locator('#painel').boundingBox();
    await act.cursorShow(Math.round(box.x + box.width * 0.8), Math.round(box.y + 160));
    mark('todas', 'Início: painel com o alarme ligado e sem alertas; app em "Nenhum alerta agora"; página dela no QR do banheiro feminino');
    await pause(5000);

    // 1. Ela pede ajuda.
    await tap(ela.getByRole('button', { name: /Estou me sentindo insegura/ }), { tela: 'ela', evento: 'Toca em "Estou me sentindo insegura"', pauseMs: 0 });
    const [tWord, tApp, tPanel] = await Promise.all([
      when(frames.ela, cond.text, 'Sua palavra-código', { tela: 'ela', evento: '"Pedido enviado à equipe" com a palavra-código' }),
      when(frames.app, cond.text, '1 alerta', { tela: 'app', evento: 'Alerta novo na lista, em latão, pulsando; o alarme toca' }),
      when(frames.painel, cond.selector, '.panel-alarm-ringing', { tela: 'painel', evento: 'Cartão novo "Ninguém viu ainda"; o painel bipa' }),
    ]);
    void tWord;
    await pause(7000); // o pulso do alerta novo

    // 2. O Diego abre o alerta: vira "Visto" nas três telas, o alarme e o bipe param.
    const card = app.getByRole('button', { name: /Banheiro feminino/ }).filter({ visible: true }).first();
    await tap(card, { tela: 'app', evento: 'Diego abre o alerta' });
    // O app cala quando a lista do servidor traz o alerta visto (silence() em useActiveAlerts).
    const [tSeenPanel, tSeenApp] = await Promise.all([
      when(frames.painel, cond.noSelector, '.panel-alarm-ringing', { tela: 'painel', evento: 'Cartão em "Visto; ninguém foi mandado ainda"; o bipe para' }),
      when(frames.app, cond.text, 'Visto; ninguém foi ainda', { tela: 'app', evento: 'Detalhe aberto em "Visto", com "Diga esta palavra a ela" (o alarme do app pararia aqui; nesta tomada ele já tinha terminado)' }),
      when(frames.ela, cond.text, 'A equipe viu o seu pedido', { tela: 'ela', evento: '"A equipe viu o seu pedido"' }),
    ]);
    await pause(6000);

    // 3. "Estou indo".
    await tap(app.getByRole('button', { name: 'Estou indo' }).filter({ visible: true }).first(), { tela: 'app', evento: 'Toca em "Estou indo"' });
    await Promise.all([
      when(frames.ela, cond.text, 'Diego, de camisa preta, está indo até você', { tela: 'ela', evento: '"Diego, de camisa preta, está indo até você"' }),
      when(frames.painel, cond.text, 'está indo até ela', { tela: 'painel', evento: 'Cartão em "A caminho": "Diego está indo até ela"' }),
    ]);
    await pause(8000); // no painel, o tempo "há ..." corre

    // 4. Encerrar com um desfecho.
    await tap(app.getByRole('button', { name: /Encerrar/ }).filter({ visible: true }).first(), { tela: 'app', evento: 'Toca em "Encerrar…": abre a folha de desfechos' });
    await tap(app.getByRole('button', { name: /Acompanhei até um lugar seguro/ }).filter({ visible: true }).first(), { tela: 'app', evento: 'Escolhe "Acompanhei até um lugar seguro ou até o carro"', pauseMs: 2500 });
    await Promise.all([
      when(frames.ela, cond.text, 'Pedido encerrado', { tela: 'ela', evento: '"Pedido encerrado": a linha do tempo chega a "Encerrado"' }),
      when(frames.painel, cond.text, 'Nenhum alerta em aberto.', { tela: 'painel', evento: 'O cartão sai: "Nenhum alerta em aberto."' }),
    ]);
    await pause(7000);
    mark('todas', 'Fim');

    return { sounds: [...alarmEvents(tApp, tSeenApp), ...beepEvents(tPanel, tSeenPanel)] };
  },
};
