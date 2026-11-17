import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODE_WORDS, displayCode, normalizeCode, pickCodeWord, spokenCode } from '../codeWords';

describe('palavras-código', () => {
  it('a lista do banco é igual à do app e da web', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../../db/migrations/004_code_words.sql', import.meta.url)), 'utf8');
    const block = sql.slice(sql.indexOf('array['), sql.indexOf('];'));
    const fromSql = [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(fromSql).toEqual([...CODE_WORDS]);
  });

  it('palavras únicas, sem acento e curtas', () => {
    expect(new Set(CODE_WORDS).size).toBe(CODE_WORDS.length);
    for (const w of CODE_WORDS) expect(w).toMatch(/^[a-z]{4,10}$/);
  });

  it('não sorteia palavra já em uso e só repete com todas tomadas', () => {
    const taken = CODE_WORDS.slice(0, CODE_WORDS.length - 1);
    for (let i = 0; i < 20; i++) expect(pickCodeWord(taken)).toBe(CODE_WORDS[CODE_WORDS.length - 1]);
    expect(CODE_WORDS).toContain(pickCodeWord(CODE_WORDS));
  });

  it('busca sem diferença de maiúscula, acento ou espaço', () => {
    expect(normalizeCode('  Borboléta ')).toBe('borboleta');
  });

  it('mostra com maiúscula e lê a palavra inteira; códigos antigos ficam como estão', () => {
    expect(displayCode('chuva')).toBe('Chuva');
    expect(spokenCode('chuva')).toBe('chuva');
    expect(displayCode('K7MX')).toBe('K7MX');
    expect(spokenCode('K7MX')).toBe('K 7 M X');
  });
});
