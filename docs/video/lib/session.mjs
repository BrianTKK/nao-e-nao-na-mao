// Login das contas de demonstração pela API, fora da tela: a senha nunca aparece em quadro.
// Os tokens ficam guardados em <OUT>/trabalho/sessoes.json (fora do git) e são reaproveitados
// enquanto o servidor local estiver no ar, para não gastar o limite de 10 logins por 5 minutos.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, DIRS, REPO } from './env.mjs';

const CACHE = join(DIRS.work, 'sessoes.json');

function demoPassword() {
  const src = readFileSync(join(REPO, 'shared', 'src', 'data', 'demo.ts'), 'utf8');
  const m = /DEMO_PASSWORD = '([^']+)'/.exec(src);
  if (!m) throw new Error('DEMO_PASSWORD não encontrado em shared/src/data/demo.ts');
  return m[1];
}

export async function api(path, { token, body, method } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/** Token de uma conta do bar de demonstração (diego, ana, rafael, marta). */
export async function token(name) {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  if (cache[name]) {
    const me = await api('/me', { token: cache[name] });
    if (me.status === 200) return cache[name];
  }
  const res = await api('/auth/login', { body: { email: `${name}@bar-esquina.test`, password: demoPassword() } });
  if (res.status !== 200) {
    throw new Error(
      res.status === 429
        ? 'Limite de logins do servidor local (10 por 5 min por IP): reinicie o servidor local.'
        : `Login de ${name} falhou (${res.status})`,
    );
  }
  cache[name] = res.body.token;
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  return res.body.token;
}

/** Encerra todo alerta aberto do bar, para a tomada começar limpa. */
export async function closeOpenAlerts() {
  const marta = await token('marta');
  const list = (await api('/staff/alerts/active', { token: marta })).body ?? [];
  for (const a of list) await api(`/staff/alerts/${a.id}/resolve`, { token: marta, body: { outcome: 'false_alarm' } });
  return list.length;
}
