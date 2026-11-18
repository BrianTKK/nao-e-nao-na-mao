import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Maior tamanho de fonte (entre `min` e `max`) em que a maior palavra do texto cabe na largura dada.
 * `adjustsFontSizeToFit` só funciona no Android e só com uma linha; isto vale em qualquer lugar e deixa o
 * texto quebrar entre palavras, nunca no meio de uma. `perChar` é a largura de uma letra em fração do corpo:
 * a Fraunces 600 gasta de 0,5 a 0,69 (a mais larga das palavras-código é "Nuvem"), então 0,66 serve para
 * nomes de lugar e 0,72 para a palavra-código, com folga se a fonte não carregar.
 */
export function fitFontSize(text: string, width: number, max: number, min: number, perChar = 0.66): number {
  if (width <= 0) return max;
  const longest = text.split(/\s+/).reduce((n, word) => Math.max(n, word.length), 1);
  return Math.max(min, Math.min(max, Math.floor(width / (longest * perChar))));
}

/** O tamanho da fonte para o texto caber na largura que o próprio elemento recebe (passe `onLayout` a ele). */
export function useFitFont(text: string, max: number, min: number, perChar?: number) {
  const [width, setWidth] = useState(0);
  return {
    size: fitFontSize(text, width, max, min, perChar),
    onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
  };
}
