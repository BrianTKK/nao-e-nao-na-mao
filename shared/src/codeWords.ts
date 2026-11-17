/**
 * Palavras-código dos alertas. Quem vai até ela diz a palavra, e ela confere
 * com a da própria tela. Pedido do Brian (16/11/2026): "Código se tornar
 * palavras (borboleta, chuva, toalha, etc)".
 *
 * Critérios da lista:
 * - substantivos comuns, de 2 a 4 sílabas, fáceis de falar num lugar barulhento;
 * - sem acento, cedilha ou hífen, para digitar e buscar sem erro;
 * - sem duplo sentido nem gíria: ficam de fora frutas e legumes com conotação
 *   sexual (banana, pepino), bichos usados como xingamento (vaca, galinha,
 *   baleia, cobra), apelidos de cantada (gata, princesa, boneca), nomes de
 *   pessoa e palavras de política ou de fraude (tucano, laranja).
 *
 * A mesma lista está em db/migrations/004_code_words.sql; o teste
 * codeWords.test.ts confere que as duas são iguais.
 */
export const CODE_WORDS = [
  'borboleta', 'chuva', 'toalha', 'janela', 'cadeira', 'panela', 'girassol', 'abacate',
  'caneta', 'escada', 'tomate', 'sapato', 'bicicleta', 'garrafa', 'farol', 'ponte',
  'nuvem', 'montanha', 'floresta', 'cachoeira', 'estrela', 'tijolo', 'tapete', 'almofada',
  'lanterna', 'mochila', 'pipoca', 'castelo', 'jardim', 'oceano', 'planeta', 'foguete',
  'tesoura', 'martelo', 'violino', 'piano', 'tambor', 'semente', 'palmeira', 'cogumelo',
  'tartaruga', 'girafa', 'coruja', 'golfinho', 'esquilo', 'abelha', 'joaninha', 'caracol',
  'canguru', 'pinguim', 'elefante', 'navio', 'barco', 'cometa', 'moinho', 'chaleira',
  'vassoura', 'peteca', 'sorvete', 'pudim', 'morango', 'ameixa',
] as const;

/**
 * Sorteia uma palavra que não esteja em uso por outro alerta aberto do mesmo
 * bar. Com todas em uso (mais de 60 alertas abertos ao mesmo tempo), repete.
 */
export function pickCodeWord(taken: Iterable<string>, rand: () => number = Math.random): string {
  const used = new Set(Array.from(taken, normalizeCode));
  const free = CODE_WORDS.filter((w) => !used.has(w));
  const pool = free.length > 0 ? free : CODE_WORDS;
  return pool[Math.floor(rand() * pool.length)];
}

/** Para comparar e buscar: minúsculas, sem acento e sem espaço nas pontas. */
export function normalizeCode(code: string): string {
  return code.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Como a palavra aparece na tela: "Borboleta". Códigos antigos de 4 letras ficam como estão. */
export function displayCode(code: string): string {
  return /^[a-z]+$/.test(code) ? code[0].toUpperCase() + code.slice(1) : code;
}

/** Como o leitor de tela lê: a palavra inteira; códigos antigos, letra por letra. */
export function spokenCode(code: string): string {
  return /^[a-z]+$/.test(code) ? code : code.split('').join(' ');
}
