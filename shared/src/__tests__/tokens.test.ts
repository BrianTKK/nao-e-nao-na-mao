import { describe, expect, it } from 'vitest';
import { color } from '../tokens';
import { contrastRatio } from '../contrast';

/** WCAG 1.4.3 (texto) e 1.4.11 (gráfico, borda de controle, anel de foco). */
const TEXT = 4.5;
const GRAPHIC = 3;

const darkBackgrounds = { bg: color.bg, surface: color.surface } as const;

function expectPair(fg: string, bg: string, min: number) {
  const ratio = contrastRatio(fg, bg);
  expect(ratio, `${fg} sobre ${bg}: ${ratio.toFixed(2)}:1 (mínimo ${min}:1)`).toBeGreaterThanOrEqual(min);
}

describe('contraste da identidade visual (Comanda)', () => {
  it('texto principal passa do AAA (7:1) no fundo, na superfície e na superfície elevada', () => {
    for (const bg of [color.bg, color.surface, color.surfaceRaised]) expectPair(color.text, bg, 7);
  });

  it('texto e texto de apoio passam de 4,5:1 no fundo e na superfície', () => {
    for (const bg of Object.values(darkBackgrounds)) {
      expectPair(color.text, bg, TEXT);
      expectPair(color.textMuted, bg, TEXT);
    }
  });

  it('texto do botão sálvia (onAccent sobre accent) passa de 4,5:1', () => {
    expectPair(color.onAccent, color.accent, TEXT);
  });

  it('texto do botão de latão (onAlert sobre alert) passa de 4,5:1', () => {
    expectPair(color.onAlert, color.alert, TEXT);
  });

  it('latão contra o fundo (borda e bloco do alerta) passa de 3:1', () => {
    expectPair(color.alert, color.bg, GRAPHIC);
  });

  it('borda de controle no fundo passa de 3:1 (WCAG 1.4.11)', () => {
    expectPair(color.borderStrong, color.bg, GRAPHIC);
  });

  it('anel de foco no fundo passa de 3:1', () => {
    expectPair(color.focus, color.bg, GRAPHIC);
  });

  it('texto de perigo no fundo passa de 4,5:1', () => {
    expectPair(color.danger, color.bg, TEXT);
  });

  it('cada cor de estado passa de 3:1 no fundo e na superfície', () => {
    for (const [name, c] of Object.entries(color.status)) {
      for (const bg of Object.values(darkBackgrounds)) {
        expect(contrastRatio(c, bg), `estado ${name}`).toBeGreaterThanOrEqual(GRAPHIC);
      }
    }
  });

  it('folha e papel (placa impressa, logo positivo) passam de 4,5:1 nos dois sentidos', () => {
    expectPair(color.leaf, color.paper, TEXT);
    expectPair(color.paper, color.leaf, TEXT);
  });

  it('legenda sobre papel passa de 4,5:1', () => {
    expectPair(color.paperMuted, color.paper, TEXT);
  });

  it('não sobrou rosa na paleta', () => {
    const all = JSON.stringify(color).toUpperCase();
    for (const pink of ['#FF7EAD', '#141118']) expect(all).not.toContain(pink);
  });
});
