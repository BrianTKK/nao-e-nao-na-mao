import { describe, expect, it } from 'vitest';
import { color } from '../tokens';
import { contrastRatio } from '../contrast';

const backgrounds = [color.bg, color.surface, color.surfaceRaised];

describe('contraste da identidade visual', () => {
  it('texto principal passa do AAA (7:1) em todos os fundos', () => {
    for (const bg of backgrounds) expect(contrastRatio(color.text, bg)).toBeGreaterThanOrEqual(7);
  });

  it('texto secundário, cores de estado, foco e erro passam do AA (4,5:1)', () => {
    const fg = [color.textMuted, color.accent, color.danger, color.focus, ...Object.values(color.status)];
    for (const c of fg) for (const bg of backgrounds) expect(contrastRatio(c, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('texto do botão principal sobre a cor de destaque passa do AA', () => {
    expect(contrastRatio(color.onAccent, color.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('borda de campo tem 3:1 (WCAG 1.4.11)', () => {
    for (const bg of backgrounds) expect(contrastRatio(color.borderStrong, bg)).toBeGreaterThanOrEqual(3);
  });
});
