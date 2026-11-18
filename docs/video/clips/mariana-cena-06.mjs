// mariana-cena-06.mp4: o painel grande, o tempo correndo e o cartão que acende na troca de estado
// (cena 6 do roteiro). O alerta foi criado e visto antes de gravar; na gravação, o Diego toca em
// "Estou indo" (pela API, com a conta dele) e o cartão passa a "A caminho" e acende.
import { cond } from '../lib/actions.mjs';
import { api, token } from '../lib/session.mjs';
import { PANE_PAINEL, waitText } from '../lib/trio.mjs';

let alertId = null;

export const clip = {
  file: 'mariana-cena-06.mp4',
  scene: '6, Painel, o tempo corre (1:08 a 1:18)',
  summary: 'O painel grande: o cartão passa de "Visto" a "A caminho" e acende, com "Diego Santos está indo até ela" e o tempo "há 1 min ..." correndo.',
  speech: ['No painel, o tempo corre. O cartão acende a cada mudança de estado, para a gerência ver o que mudou.'],
  notes: [
    'Motion 3: o cartão acende na troca de estado (live-flash do LiveBoard). A troca acontece dentro do clipe: o alerta estava em "Visto" e passa a "A caminho" quando o Diego toca em "Estou indo" no app dele, que não aparece aqui (o toque foi feito pela conta dele, pela API).',
    'O alerta foi criado cerca de 1 min 35 s antes do clipe, para o tempo do cartão já estar em "há 1 min ..." e ir mudando.',
    'Em "A caminho", o cartão só tem o botão "Encerrar": "Estou indo", "Vi o alerta" e "Mandar alguém" somem. O cursor só aponta, não clica em nada.',
    'Sem som: o alerta já estava visto quando o clipe começou, então o painel não bipa.',
  ],
  preset: 'desktop',
  panes: [PANE_PAINEL],
  sessions: { panel: 'marta' },
  panelAlarm: true,
  async ready({ page, frames }) {
    await page.frameLocator('#painel').getByText('Nenhum alerta em aberto.').waitFor({ timeout: 60_000 });
    const marta = await token('marta');
    const diego = await token('diego');
    const before = new Set(((await api('/staff/alerts/active', { token: marta })).body ?? []).map((a) => a.id));
    const created = await api('/alerts', { body: { spotCode: 'ESQBF7K2', kind: 'unsafe' } });
    if (created.status !== 201) throw new Error(`pedido recusado (${created.status}): limite de pedidos? espere 1 minuto`);
    const t0 = Date.now();
    alertId = ((await api('/staff/alerts/active', { token: marta })).body ?? []).find((a) => !before.has(a.id))?.id;
    const ack = await api(`/staff/alerts/${alertId}/ack`, { token: diego, body: {} });
    if (ack.status !== 200) throw new Error(`"Vi o alerta" recusado (${ack.status})`);
    await waitText(frames.painel, 'Visto; ninguém foi mandado ainda');
    // O tempo do cartão começa em "há 1 min 3x s" quando a gravação começa.
    while (Date.now() - t0 < 93_000) await new Promise((r) => setTimeout(r, 200));
  },
  async run({ page, frames, act }) {
    const painel = page.frameLocator('#painel');
    const { pause, when, mark } = act;
    const cardBox = await painel.getByText('Visto; ninguém foi mandado ainda').boundingBox();
    await act.cursorShow(Math.round(cardBox.x + cardBox.width + 260), Math.round(cardBox.y + 60));
    mark('painel', 'Início: o cartão do banheiro feminino em "Visto; ninguém foi mandado ainda", com "Estou indo" e "Mandar alguém"', undefined, 'No painel, o tempo corre.');
    await pause(3000);
    const diego = await token('diego');
    const started = api(`/staff/alerts/${alertId}/start`, { token: diego, body: {} });
    mark('painel', 'O Diego toca em "Estou indo" no app dele (fora da tela)');
    await when(frames.painel, cond.text, 'está indo até ela', { tela: 'painel', evento: 'O cartão passa a "A caminho" e acende: "Diego Santos está indo até ela"; só sobra o botão "Encerrar"', fala: 'O cartão acende a cada mudança de estado, para a gerência ver o que mudou.' });
    if ((await started).status !== 200) throw new Error('"Estou indo" recusado');
    await pause(1800);
    // O cursor vai até o tempo do cartão, que continua correndo.
    const time = await painel.locator('.live-time').first().boundingBox();
    await act.cursorMove(Math.round(time.x + time.width * 0.45), Math.round(time.y + time.height + 6), 900);
    mark('painel', 'O cursor aponta o tempo do cartão, "há 1 min ...", que continua mudando');
    await pause(4500);
    const who = await painel.getByText('está indo até ela').first().boundingBox();
    await act.cursorMove(Math.round(who.x + who.width + 30), Math.round(who.y + who.height / 2 + 10), 900);
    mark('painel', 'O cursor aponta "Diego Santos está indo até ela"');
    await pause(4000);
    mark('painel', 'Fim');
    return { sounds: [] };
  },
};
