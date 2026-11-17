// Testa a limpeza do deploy sem SSH: o plano (prune-plan.mjs) e quem apaga
// (prune-remote.sh, rodado com bash numa pasta temporária).
// Roda com: node --test deploy/prune.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafePath, parseList, planPrune } from './prune-plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('arquivo que saiu do repositório é apagado, e a pasta que ficou vazia também', () => {
  const old = ['README.md', 'web/src/pages/help/MenuDisguise.tsx', 'web/src/pages/help/HelpPage.tsx', 'old/only/file.txt'];
  const now = ['README.md', 'web/src/pages/help/HelpPage.tsx'];
  const plan = planPrune(old, now);
  assert.deepEqual(plan.files, ['old/only/file.txt', 'web/src/pages/help/MenuDisguise.tsx']);
  // A pasta help continua em uso; old/only e old ficam vazias (a mais funda primeiro).
  assert.deepEqual(plan.dirs, ['old/only', 'old']);
  assert.deepEqual(plan.rejected, []);
});

test('sem lista anterior (primeira vez), não apaga nada', () => {
  assert.deepEqual(planPrune(null, ['README.md']), { files: [], dirs: [], rejected: [] });
});

test('caminho com "..", absoluto ou estranho é recusado, nunca apagado', () => {
  const old = ['../etc/passwd', '/etc/passwd', 'a/../../b', './x', 'C:/Windows/x', '-rf', 'a//b', 'ok.txt'];
  const plan = planPrune(old, []);
  assert.deepEqual(plan.files, ['ok.txt']);
  assert.equal(plan.rejected.length, old.length - 1);
  for (const p of ['../x', '/x', 'a/../b', '.', '', 'a\\b', 'a\nb']) assert.equal(isSafePath(p), false, JSON.stringify(p));
});

test('o que o deploy não enviou (fora da lista anterior) nunca entra no plano', () => {
  // .env, REVISION, node_modules, dist e backups nem estão na lista: o plano só olha a lista.
  const plan = planPrune(['a.txt', 'b.txt'], ['a.txt']);
  assert.deepEqual(plan.files, ['b.txt']);
});

test('mesmo numa lista adulterada, .env, REVISION, node_modules, dist e backups ficam', () => {
  const old = ['.env', 'REVISION', '.deployed-files', 'deploy/.env', 'node_modules/x/index.js', 'web/dist/index.html', 'backups/db.sql', '.git/config'];
  const plan = planPrune(old, []);
  assert.deepEqual(plan.files, []);
  assert.deepEqual(plan.dirs, []);
  assert.equal(plan.rejected.length, old.length);
});

test('a lista lê o formato do git ls-files -z', () => {
  assert.deepEqual(parseList(Buffer.from('a.txt\0pasta/b c.txt\0')), ['a.txt', 'pasta/b c.txt']);
});

test('prune-remote.sh apaga o plano dentro da pasta, recusa o resto e não mexe no que não está no plano', () => {
  const root = mkdtempSync(join(tmpdir(), 'nenm-prune-'));
  const outside = mkdtempSync(join(tmpdir(), 'nenm-fora-'));
  try {
    const put = (p) => {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), 'x');
    };
    ['web/src/pages/help/MenuDisguise.tsx', 'web/src/pages/help/HelpPage.tsx', 'old/only/file.txt', '.env', 'REVISION'].forEach(put);
    writeFileSync(join(outside, 'alvo.txt'), 'não apagar');
    mkdirSync(join(root, 'keep-dir'));
    writeFileSync(join(root, 'keep-dir', 'dado.txt'), 'x');

    const plan = [
      'web/src/pages/help/MenuDisguise.tsx',
      'old/only/file.txt',
      'old/only/',
      'old/',
      `../${outside.split(/[\\/]/).pop()}/alvo.txt`,
      'keep-dir/', // pasta com arquivo: rmdir não apaga
      'nao-existe.txt',
    ];
    const out = execFileSync('bash', [join(here, 'prune-remote.sh'), root], { input: plan.map((p) => `${p}\0`).join(''), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

    assert.equal(existsSync(join(root, 'web/src/pages/help/MenuDisguise.tsx')), false);
    assert.equal(existsSync(join(root, 'web/src/pages/help/HelpPage.tsx')), true);
    assert.equal(existsSync(join(root, 'old')), false);
    assert.equal(existsSync(join(root, 'keep-dir', 'dado.txt')), true);
    assert.equal(existsSync(join(root, '.env')), true);
    assert.equal(existsSync(join(root, 'REVISION')), true);
    assert.equal(existsSync(join(outside, 'alvo.txt')), true);
    assert.match(out, /Limpeza: 4 item\(ns\) apagado\(s\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
