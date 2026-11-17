#!/usr/bin/env node
// O que o deploy deve apagar na VPS: só o que ele mesmo enviou antes e saiu
// do repositório. Pedido do Brian (16/11/2026, "Sim, corrigir"), depois que o
// MenuDisguise.tsx apagado no git ficou na VPS e quebrou o build da web.
//
// Entrada: a lista do deploy anterior (.deployed-files na VPS) e a lista nova,
// as duas no formato do `git ls-files -z` (caminhos separados por \0).
// Saída: caminhos separados por \0; pasta termina com "/" (só as pastas que
// continham arquivos enviados e que não têm mais nenhum, da mais funda para a
// mais rasa). Quem apaga é deploy/prune-remote.sh, que confere tudo de novo.
//
// Uso: node deploy/prune-plan.mjs <lista-anterior|--sem-lista> <lista-nova>

import { readFileSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Nunca apagados, mesmo que apareçam numa lista (não são do repositório). */
const PROTECTED_NAMES = new Set(['.env', 'REVISION', '.deployed-files']);
const PROTECTED_DIRS = ['node_modules', 'dist', 'backups', '.git'];

/** Caminho relativo seguro: sem "..", sem barra no início, sem nome vazio ou de controle. */
export function isSafePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 1024) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(p)) return false;
  if (p.startsWith('/') || p.startsWith('-') || /^[A-Za-z]:/.test(p)) return false;
  const parts = p.split('/');
  return parts.every((s) => s !== '' && s !== '.' && s !== '..');
}

export function isProtected(p) {
  const parts = p.split('/');
  const name = parts[parts.length - 1];
  if (parts.length === 1 && PROTECTED_NAMES.has(name)) return true;
  if (name === '.env') return true;
  return parts.some((s) => PROTECTED_DIRS.includes(s));
}

export const parseList = (buf) =>
  buf
    .toString('utf8')
    .split('\0')
    .filter((p) => p.length > 0);

const parentDirs = (p) => {
  const parts = p.split('/');
  const out = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
};

/**
 * @param {string[] | null} oldList lista do deploy anterior; null = não existe (primeira vez)
 * @param {string[]} newList lista deste deploy
 * @returns {{ files: string[], dirs: string[], rejected: string[] }}
 */
export function planPrune(oldList, newList) {
  if (oldList === null) return { files: [], dirs: [], rejected: [] };
  const keep = new Set(newList);
  const rejected = [];
  const files = [];
  for (const p of new Set(oldList)) {
    if (keep.has(p)) continue;
    if (!isSafePath(p) || isProtected(p)) {
      rejected.push(p);
      continue;
    }
    files.push(p);
  }
  // Pastas que o deploy criou (pais de arquivos enviados) e que não guardam mais nenhum arquivo da lista nova.
  const stillUsed = new Set(newList.flatMap(parentDirs));
  const dirs = [...new Set(files.flatMap(parentDirs))]
    .filter((d) => !stillUsed.has(d) && !isProtected(`${d}/x`))
    .sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
  return { files: files.sort(), dirs, rejected };
}

// ------------------------------------------------------------------ linha de comando

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  // --resumo: texto para o ensaio (DEPLOY_DRY_RUN=1), em vez do plano em \0.
  const summary = args[0] === '--resumo';
  const [oldArg, newArg] = summary ? args.slice(1) : args;
  if (!oldArg || !newArg) {
    console.error('Uso: node deploy/prune-plan.mjs [--resumo] <lista-anterior|--sem-lista> <lista-nova>');
    process.exit(2);
  }
  const oldList = oldArg === '--sem-lista' ? null : parseList(readFileSync(oldArg));
  const newList = parseList(readFileSync(newArg));
  const plan = planPrune(oldList, newList);
  for (const r of plan.rejected) console.error(`RECUSADO (caminho inseguro ou protegido): ${JSON.stringify(r)}`);
  if (summary) {
    const before = new Set(oldList ?? []);
    const added = newList.filter((p) => !before.has(p));
    const lines = [
      `Enviaria ${newList.length} arquivo(s).`,
      oldList === null
        ? 'Sem lista do deploy anterior: nada seria apagado; a lista seria gravada agora.'
        : `Novos desde o último deploy (${added.length}):${added.map((p) => `\n  + ${p}`).join('')}`,
      `Seriam apagados (${plan.files.length + plan.dirs.length}):${[...plan.files, ...plan.dirs.map((d) => `${d}/`)].map((p) => `\n  - ${p}`).join('')}`,
    ];
    console.log(lines.join('\n'));
  } else {
    const out = [...plan.files, ...plan.dirs.map((d) => `${d}/`)].map((p) => `${p}\0`).join('');
    if (out) writeSync(1, out);
  }
}
