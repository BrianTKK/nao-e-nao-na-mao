import { StyleSheet } from 'react-native';
import { tokens } from '@nenm/shared';

export const { color, space, radius, fontSize, touchTarget, motion } = tokens;

/** Estilos comuns do app, a partir dos tokens compartilhados com a web. */
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.md, gap: space.md },
  h1: { color: color.text, fontSize: fontSize.xl, fontWeight: '700' },
  h2: { color: color.text, fontSize: fontSize.lg, fontWeight: '700' },
  body: { color: color.text, fontSize: fontSize.md, lineHeight: fontSize.md * 1.45 },
  muted: { color: color.textMuted, fontSize: fontSize.sm },
  error: { color: color.danger, fontSize: fontSize.sm, fontWeight: '700' },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: space.xs,
  },
  input: {
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    color: color.text,
    fontSize: fontSize.md,
    backgroundColor: color.bg,
  },
  label: { color: color.text, fontSize: fontSize.sm, fontWeight: '700' },
});
