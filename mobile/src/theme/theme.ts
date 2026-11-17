import { Platform, StyleSheet } from 'react-native';
import { tokens } from '@nenm/shared';

export const { color, space, radius, fontSize, lineHeight, touchTarget, motion } = tokens;

/*
 * Fontes do app (direção "Comanda"): Fraunces 600 em títulos, números, nome do
 * lugar e palavra-código; Instrument Sans no texto e nos botões. Os nomes são
 * os que o _layout registra com useFonts. Cada peso é uma família própria, por
 * isso estilo com estas fontes não leva `fontWeight` (no Android, peso em
 * fonte carregada pode fazer cair na do sistema).
 *
 * Se o carregamento falhar, o app segue: no Android uma família desconhecida
 * vira a fonte do sistema; na web a pilha abaixo cai em Georgia/system-ui.
 */
const withFallback = (name: string, stack: string): string =>
  Platform.select({ web: `${name}, ${stack}`, default: name });

const serif = 'Georgia, "Times New Roman", serif';
const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export const font = {
  /** Fraunces 600: títulos, números, nome do lugar, palavra-código. */
  display: withFallback('Fraunces_600SemiBold', serif),
  /** Instrument Sans 400: texto corrido. */
  body: withFallback('InstrumentSans_400Regular', sans),
  /** Instrument Sans 500: ênfase leve, link, botão ghost. */
  bodyMedium: withFallback('InstrumentSans_500Medium', sans),
  /** Instrument Sans 600: rótulos, botões, negrito. */
  bodySemibold: withFallback('InstrumentSans_600SemiBold', sans),
} as const;

/** Estilos comuns do app, a partir dos tokens compartilhados com a web. */
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.md, gap: space.md },

  /** Título da tela (Fraunces 28). */
  h1: {
    color: color.text,
    fontFamily: font.display,
    fontSize: fontSize.xl,
    lineHeight: Math.round(fontSize.xl * 1.15),
    letterSpacing: -0.28,
  },
  /** Título de seção ou de cartão (Fraunces 22). */
  h2: {
    color: color.text,
    fontFamily: font.display,
    fontSize: fontSize.lg,
    lineHeight: Math.round(fontSize.lg * 1.2),
    letterSpacing: -0.2,
  },
  /** Subtítulo pequeno (Fraunces 18). */
  h3: {
    color: color.text,
    fontFamily: font.display,
    fontSize: fontSize.md,
    lineHeight: Math.round(fontSize.md * 1.25),
  },
  /** Fraunces sem tamanho: nome do lugar, palavra-código (some o fontSize). */
  display: { color: color.text, fontFamily: font.display, letterSpacing: -0.2 },
  /** Número em Fraunces com algarismos da mesma largura (tempo, contagem). */
  num: {
    color: color.text,
    fontFamily: font.display,
    fontVariant: ['tabular-nums', 'lining-nums'],
  },

  /** Texto corrido (Instrument Sans 18). */
  body: {
    color: color.text,
    fontFamily: font.body,
    fontSize: fontSize.md,
    lineHeight: Math.round(fontSize.md * lineHeight.normal),
  },
  /** Negrito no meio do texto (combine com ui.body ou ui.muted). */
  strong: { fontFamily: font.bodySemibold },
  /** Texto de apoio (Instrument Sans 16, cor de apoio). */
  muted: {
    color: color.textMuted,
    fontFamily: font.body,
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * lineHeight.normal),
  },
  error: {
    color: color.danger,
    fontFamily: font.bodySemibold,
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * lineHeight.normal),
  },
  /** Link de texto (sálvia sublinhada). */
  link: {
    color: color.accent,
    fontFamily: font.bodyMedium,
    textDecorationLine: 'underline',
  },

  /** Cartão: superfície, borda de linha, raio 8. */
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: space.xs,
  },
  /** Filete de divisão (1 px na cor de linha). */
  rule: { height: 1, backgroundColor: color.border },

  /** Campo de texto: borda de controle (3:1), raio 6, 48 px. */
  input: {
    minHeight: touchTarget,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    color: color.text,
    fontFamily: font.body,
    fontSize: fontSize.md,
    backgroundColor: color.bg,
  },
  /** Rótulo de campo (Instrument Sans 600, 16). */
  label: { color: color.text, fontFamily: font.bodySemibold, fontSize: fontSize.sm },
  /** Rótulo em maiúsculas (14, espaçado), como "NOVO" ou "PALAVRA-CÓDIGO". */
  labelCaps: {
    color: color.textMuted,
    fontFamily: font.bodySemibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
  },
});
