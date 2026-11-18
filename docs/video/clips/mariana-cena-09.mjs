// mariana-cena-09.mp4: design e UX (cena 9 do roteiro). A página dela (sem logo, com o nome do
// bar no cabeçalho) e o detalhe do alerta no app (a barra de baixo com "Estou indo" e
// "Encerrar…"), com realces; no fim, a cartela do antes e depois do visual.
import { api } from '../lib/session.mjs';
import { PANE_APP, PANE_ELA, visibleButton, waitInitial, waitText } from '../lib/trio.mjs';

/** União das caixas de vários elementos (coordenadas do palco). */
async function unionBox(locators) {
  const boxes = await Promise.all(locators.map((l) => l.boundingBox()));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.width)) - x, h: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

export const clip = {
  file: 'mariana-cena-09.mp4',
  scene: '9, Design e UX (1:50 a 2:03)',
  summary: 'Design e UX: a página dela sem logo, com o nome do bar no cabeçalho, e o detalhe do alerta no app com a ação principal embaixo; depois, a cartela do antes e depois do visual.',
  speech: [
    'Identidade visual nas duas partes. A página dela não tem logo e o título é o nome do bar, para passar despercebida. No app, a ação principal fica ao alcance do polegar.',
  ],
  notes: [
    'Os contornos em sálvia são realces de edição desenhados no palco, não fazem parte do produto.',
    'O alerta aberto no app é de outro local (Mesa 12), criado antes do clipe, para a página dela continuar no início, sem pedido.',
    'O botão "Ver cardápio" não aparece: o bar de demonstração do servidor local não tem cardápio cadastrado.',
    'Os últimos segundos (a partir da marca "Cartela do antes e depois") são material extra: a imagem docs/pdf/imagens/05-antes-e-depois-do-visual.png. A edição usa ou corta.',
    'A identidade vem de shared/src/tokens.ts, a mesma na web e no app.',
  ],
  preset: 'pair',
  panes: [
    PANE_ELA,
    PANE_APP,
    {
      overlay: true,
      id: 'antes-depois',
      hidden: true,
      html: `<style>
#antes-depois{flex-direction:row;gap:80px;background:#0E1512;padding:0 120px}
#antes-depois img{height:960px;width:auto;border-radius:8px;border:2px solid #33433A}
#antes-depois .side{display:flex;flex-direction:column;gap:24px;text-align:left;max-width:640px}
</style>
<img src="/assets/05-antes-e-depois-do-visual.png" alt="">
<div class="side"><div class="card-title">Antes e depois do visual</div><div class="card-text" style="font-size:30px;color:#A9B3AA">As mesmas telas, antes e depois da identidade da Mariana: verde-garrafa escuro com latão.</div></div>`,
    },
  ],
  sessions: { app: 'diego' },
  async ready({ page, frames }) {
    await waitInitial({ page, frames });
    const created = await api('/alerts', { body: { spotCode: 'ESQM12T3', kind: 'unsafe' } });
    if (created.status !== 201) throw new Error(`pedido recusado (${created.status})`);
    const app = page.frameLocator('#app');
    await visibleButton(app, /Mesa 12/).click({ timeout: 20_000 });
    await waitText(frames.app, 'Visto; ninguém foi ainda');
    await new Promise((r) => setTimeout(r, 3000));
  },
  async run({ page, act }) {
    const ela = page.frameLocator('#ela');
    const app = page.frameLocator('#app');
    const { pause, mark } = act;
    mark('todas', 'Início: a página dela no início (sem logo, "Bar Esquina da Vila" no cabeçalho) e o detalhe do alerta no app', undefined, 'Identidade visual nas duas partes.');
    await pause(2800);
    const head = await unionBox([ela.getByText('Bar Esquina da Vila').first(), ela.getByRole('heading').first()]);
    await act.stage('highlight', head.x, head.y, head.w, head.h, 12);
    mark('ela', 'Realce no cabeçalho dela: o nome do bar e o título, sem logo', undefined, 'A página dela não tem logo e o título é o nome do bar, para passar despercebida.');
    await pause(4800);
    await act.stage('clearHighlights');
    await pause(500);
    const bar = await unionBox([visibleButton(app, 'Estou indo'), visibleButton(app, /Encerrar/)]);
    await act.stage('highlight', bar.x, bar.y, bar.w, bar.h, 10);
    mark('app', 'Realce na barra de baixo do app: "Estou indo" e "Encerrar…", ao alcance do polegar', undefined, 'No app, a ação principal fica ao alcance do polegar.');
    await pause(4500);
    await act.stage('clearHighlights');
    mark('todas', 'Os realces saem; as duas telas ficam paradas');
    await pause(2000);
    await act.stage('show', '#antes-depois', true);
    mark('palco', 'Cartela do antes e depois do visual (material extra)');
    await pause(6000);
    mark('todas', 'Fim');
    return { sounds: [] };
  },
};
