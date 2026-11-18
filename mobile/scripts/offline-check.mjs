// Fila de toques sem sinal, de ponta a ponta, no app aberto no navegador (Expo web)
// contra um servidor de verdade. O Playwright corta a rede da página; a "outra
// pessoa" (Ana, Marta) age direto pela API, que continua no ar.
//
// Como rodar (três terminais, a partir da raiz do repositório):
//   1. cd server && PORT=8099 PGLITE_DIR=memory SEED_DEMO=1 CORS_ORIGINS=http://localhost:8098 npx tsx src/index.ts
//   2. cd mobile && EXPO_PUBLIC_API_URL=http://localhost:8099 npx expo start --web --port 8098
//   3. npm run test:offline -w mobile
// SHOTS_DIR=<pasta> guarda as capturas de cada passo.
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? 'http://localhost:8098';
const API = process.env.API_URL ?? 'http://localhost:8099';
const SHOTS = process.env.SHOTS_DIR;
// A senha das contas do bar de demonstração, do mesmo lugar de onde o app a lê.
const DEMO_PASSWORD = /DEMO_PASSWORD = '([^']+)'/.exec(readFileSync(join(here, '../../shared/src/data/demo.ts'), 'utf8'))[1];

const results = [];
const started = Date.now();
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${String(Math.round((Date.now() - started) / 1000)).padStart(3)} s  ${name}${detail ? ` (${detail})` : ''}`);
};

async function api(path, { token, body, method } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const login = async (name) => (await api('/auth/login', { body: { email: `${name}@bar-esquina.test`, password: DEMO_PASSWORD } })).body.token;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let shot = 0;
const capture = async (name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // Espera o motion de mudança de estado terminar.
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, `${String(++shot).padStart(2, '0')}-${name}.png`) });
};
// A lista continua montada por baixo da tela do alerta: só conta o que está de fato à vista.
const shown = (text) => page.getByText(text, { exact: false }).filter({ visible: true });
const visible = (text, timeout = 20_000) =>
  shown(text)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false,
    );
const gone = async (text, timeout = 30_000) => {
  const limit = Date.now() + timeout;
  while (Date.now() < limit) {
    if ((await shown(text).count()) === 0) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
const button = (name) => page.getByRole('button', { name }).filter({ visible: true }).first();

try {
  const [ana, marta] = await Promise.all([login('ana'), login('marta')]);
  const serverAlert = async (id) => (await api(`/staff/alerts/${id}`, { token: marta })).body;
  const newAlert = async (spotCode) => {
    const before = new Set((await api('/staff/alerts/active', { token: marta })).body.map((a) => a.id));
    await api('/alerts', { body: { spotCode, kind: 'unsafe' } });
    return (await api('/staff/alerts/active', { token: marta })).body.find((a) => !before.has(a.id));
  };

  // Começa sem alerta aberto (o servidor pode ter sobrado de outra rodada).
  for (const a of (await api('/staff/alerts/active', { token: marta })).body) {
    await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  }

  // ---------------------------------------------------------------- entrar
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await button(/conta de teste do Diego/).click({ timeout: 180_000 });
  await button('Entrar').click();
  check('entra com a conta de teste', await visible('Nenhum alerta agora'));

  // ---------------------------------------------------------------- 1. "Estou indo" sem sinal
  const first = await newAlert('ESQBF7K2');
  await page.getByRole('button', { name: new RegExp(first.spotLabel) }).first().click({ timeout: 20_000 });
  await button('Estou indo').waitFor({ timeout: 20_000 });
  check('abrir o alerta marca como visto no servidor', (await serverAlert(first.id)).status === 'seen');

  await context.setOffline(true);
  await button('Estou indo').click();
  check('sem sinal: aparece "Sem sinal: vai enviar quando voltar"', await visible('Sem sinal: vai enviar quando voltar'));
  check('sem sinal: a tela já mostra "Você está indo até ela"', await visible('Você está indo até ela', 3000));
  check('sem sinal: diz que a equipe e ela só veem quando o sinal voltar', await visible('A equipe e ela só veem quando o sinal voltar', 3000));
  check('sem sinal: o servidor ainda não sabe (continua "visto")', (await serverAlert(first.id)).status === 'seen');
  await capture('estou-indo-sem-sinal');

  await context.setOffline(false);
  check('o sinal voltou: o aviso some sozinho', await gone('Sem sinal: vai enviar quando voltar'));
  const sent = await serverAlert(first.id);
  check('o sinal voltou: o servidor recebeu o "Estou indo" do Diego', sent.status === 'on_the_way' && /Diego/.test(sent.responderName ?? ''), sent.status);
  await capture('estou-indo-enviado');

  // ---------------------------------------------------------------- 2. encerrar sem sinal, e a gerência encerra antes
  await context.setOffline(true);
  await button(/Encerrar/).click();
  await button(/Acompanhei até um lugar seguro/).click({ timeout: 10_000 });
  check('sem sinal: o encerramento fica guardado, com aviso', await visible('O encerramento está guardado neste celular'));
  await capture('encerrar-sem-sinal');
  const byManager = await api(`/staff/alerts/${first.id}/resolve`, { token: marta, body: { outcome: 'ride_called', note: 'Encerrado pela gerência' } });
  check('enquanto isso, a gerência encerra pelo painel', byManager.status === 200);

  await context.setOffline(false);
  check('conflito: o app avisa que o encerramento não foi enviado', await visible('O seu encerramento não foi enviado: o alerta foi encerrado enquanto você estava sem sinal', 40_000));
  const kept = await serverAlert(first.id);
  check('conflito: vale o desfecho da gerência (não sobrescreve)', kept.outcome === 'ride_called' && kept.note === 'Encerrado pela gerência', kept.outcome);
  check('conflito: a tela mostra o desfecho que vale', await visible('Chamamos um carro ou um contato dela', 5000));
  await capture('conflito-encerrado-por-outra-pessoa');
  await button('Entendi').click();
  check('"Entendi" tira o aviso', await gone('O seu encerramento não foi enviado', 5000));

  // ---------------------------------------------------------------- 3. na lista: toque guardado, e outra pessoa assume
  await button(/Voltar aos alertas/).click();
  const second = await newAlert('ESQM12T3');
  await page.getByRole('button', { name: new RegExp(second.spotLabel) }).first().click({ timeout: 20_000 });
  await button('Estou indo').waitFor({ timeout: 20_000 });
  await context.setOffline(true);
  await button('Estou indo').click();
  await visible('Sem sinal: vai enviar quando voltar');
  await page.goBack();
  check('lista: "1 toque guardado: vai enviar quando o sinal voltar"', await visible('1 toque guardado: vai enviar quando o sinal voltar'));
  check('lista: o cartão diz "Sem sinal: ainda não enviado"', await visible('Sem sinal: ainda não enviado', 3000));
  await capture('lista-toque-guardado');
  const byAna = await api(`/staff/alerts/${second.id}/start`, { token: ana, body: {} });
  check('enquanto isso, a Ana assume', byAna.status === 200);

  await context.setOffline(false);
  check('conflito na lista: avisa, com o nome do local, que outra pessoa assumiu', await visible(`${second.spotLabel}. O seu "Estou indo" não foi enviado: outra pessoa da equipe assumiu`, 40_000));
  const taken = await serverAlert(second.id);
  check('conflito na lista: quem está indo é a Ana', taken.status === 'on_the_way' && /Ana/.test(taken.responderName ?? ''), taken.responderName);
  check('lista: o contador de toques guardados sumiu', await gone('toque guardado', 5000));
  await capture('lista-conflito-outra-pessoa-assumiu');

  check('sem erro de JavaScript na página', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('o roteiro terminou', false, String(err).slice(0, 300));
  await capture('falha');
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
