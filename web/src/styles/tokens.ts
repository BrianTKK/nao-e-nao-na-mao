import { tokens } from '@nenm/shared';

/**
 * Transforma os tokens compartilhados em variáveis CSS no :root. Assim a web
 * e o app partem do mesmo arquivo (shared/src/tokens.ts).
 * Tamanhos de fonte em rem (base 16 px), para acompanhar o zoom do navegador.
 */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  const vars: Record<string, string> = {};
  const { color, space, radius, fontSize, motion, fontFamily, touchTarget } = tokens;

  for (const [k, v] of Object.entries(color)) {
    if (typeof v === 'string') vars[`--c-${k}`] = v;
  }
  for (const [k, v] of Object.entries(color.status)) vars[`--c-status-${k}`] = v;
  for (const [k, v] of Object.entries(space)) vars[`--s-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--r-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(fontSize)) vars[`--fs-${k}`] = `${v / 16}rem`;
  for (const [k, v] of Object.entries(motion.duration)) vars[`--d-${k}`] = `${v}ms`;
  vars['--ease-standard'] = `cubic-bezier(${motion.easing.standard.join(',')})`;
  vars['--ease-exit'] = `cubic-bezier(${motion.easing.exit.join(',')})`;
  vars['--font'] = fontFamily.web;
  vars['--touch'] = `${touchTarget}px`;

  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
