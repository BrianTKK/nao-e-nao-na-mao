// mariana-cena-08.mp4: sem sinal (cena 8 do roteiro). Só o app perde a rede; o Diego toca em
// "Estou indo", o app guarda o toque e avisa; a rede volta, o toque sai e a página dela muda.
import { cond } from '../lib/actions.mjs';
import { herRequest, PANE_APP, PANE_ELA, visibleButton, waitInitial, waitText } from '../lib/trio.mjs';

export const clip = {
  file: 'mariana-cena-08.mp4',
  scene: '8, Sem sinal (1:32 a 1:50)',
  summary: 'Sem sinal: só o app perde a rede; o "Estou indo" fica guardado ("Sem sinal: vai enviar quando voltar"); a rede volta, o toque sai e a página dela muda.',
  speech: [
    'Se faltar sinal? Com o modo avião ligado, a equipe toca em "Estou indo". O app avisa: "Sem sinal: vai enviar quando voltar", e o estado fica "A caminho, ainda não enviado". Quando o sinal volta, o toque é enviado e a página dela muda.',
  ],
  notes: [
    'Não há modo avião nem barra de status do celular no navegador: o clipe não mostra o ícone do avião. A falta de sinal é simulada só no app, cortando a rede dele com o servidor (os pedidos e o tempo real falham como sem sinal). A página dela continua com rede. O rótulo acima do celular troca para "App da equipe, sem rede" enquanto dura o corte.',
    'A tomada com o ícone do avião na barra de status, no celular de verdade, é feita pelo grupo (gravador de tela do Android ou outra câmera), como diz "Antes de gravar" no roteiro. A fila sem sinal ainda não foi testada em celular real: ensaiar antes.',
    'Quando a rede volta, o app reconecta sozinho e envia o toque guardado; o tempo até isso acontecer é o do próprio app (a reconexão do tempo real), medido no registro.',
    'O pedido dela e o "Visto" foram feitos antes do clipe. Sem som: o alarme tocou antes do clipe e parou no "Visto"; o painel não está nesta cena.',
  ],
  preset: 'pair',
  panes: [PANE_ELA, PANE_APP],
  sessions: { app: 'diego' },
  offlineSwitch: true,
  async ready(ctx) {
    const { page, frames } = ctx;
    await waitInitial(ctx);
    const ok = await frames.app.evaluate(() => typeof window.__videoNet?.set === 'function');
    if (!ok) throw new Error('a chave de rede do app não foi instalada');
    await herRequest(ctx);
    await visibleButton(page.frameLocator('#app'), /Banheiro feminino/).click();
    await waitText(frames.app, 'Visto; ninguém foi ainda');
    await waitText(frames.ela, 'A equipe viu o seu pedido');
    await new Promise((r) => setTimeout(r, 3000));
  },
  async run({ page, frames, act }) {
    const app = page.frameLocator('#app');
    const { tap, pause, when, mark } = act;
    mark('todas', 'Início: o detalhe do alerta aberto no app, em "Visto"; a página dela em "A equipe viu o seu pedido"', undefined, 'Se faltar sinal?');
    await pause(2500);
    await frames.app.evaluate(() => window.__videoNet.set(true));
    await act.stage('setLabel', 'app', 'App da equipe, sem rede');
    mark('app', 'A rede do app é cortada (no celular de verdade: o modo avião). O rótulo vira "App da equipe, sem rede"', undefined, 'Com o modo avião ligado,');
    await tap(visibleButton(app, 'Estou indo'), { tela: 'app', evento: 'Toca em "Estou indo" sem rede', pauseMs: 2200, fala: 'a equipe toca em "Estou indo".' });
    await Promise.all([
      when(frames.app, cond.text, 'Sem sinal: vai enviar quando voltar', { tela: 'app', evento: 'Aviso "Sem sinal: vai enviar quando voltar", com o ícone de Wi-Fi riscado', fala: 'O app avisa: "Sem sinal: vai enviar quando voltar",' }),
      when(frames.app, cond.content, 'ainda não enviado', { tela: 'app', evento: 'Estado "A caminho, ainda não enviado" (no alto, em caixa alta) e "Você está indo até ela"', fala: 'e o estado fica "A caminho, ainda não enviado".' }),
    ]);
    await pause(6500);
    await frames.app.evaluate(() => window.__videoNet.set(false));
    await act.stage('setLabel', 'app', 'App da equipe');
    mark('app', 'A rede do app volta (no celular de verdade: desliga o modo avião). O rótulo volta a "App da equipe"', undefined, 'Quando o sinal volta,');
    await Promise.all([
      when(frames.app, cond.noText, 'Sem sinal: vai enviar quando voltar', { timeout: 40_000, tela: 'app', evento: 'O aviso some: o toque guardado foi enviado; o estado vira "A caminho"', fala: 'o toque é enviado' }),
      when(frames.ela, cond.text, 'Diego, de camisa preta, está indo até você', { timeout: 40_000, tela: 'ela', evento: 'A página dela muda: "Alguém está indo até você" e "Diego, de camisa preta, está indo até você."', fala: 'e a página dela muda.' }),
    ]);
    await pause(7500);
    mark('todas', 'Fim');
    return { sounds: [] };
  },
};
