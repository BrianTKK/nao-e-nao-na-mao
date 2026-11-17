import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/theme/theme';
import { useMotion } from '@/hooks/useMotion';
import { Icon, type IconName } from '@/components/Icon';

/**
 * - primary: latão cheio, a ação principal (uma por tela);
 * - calm: sálvia cheia, ação tranquila;
 * - secondary: contorno de controle (padrão);
 * - danger: contorno e texto perigo, sem preenchimento;
 * - ghost: só texto sublinhado (ação terciária, cabeçalho).
 */
export type ButtonVariant = 'primary' | 'calm' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'default' | 'large';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  /** 'default' = 48 px; 'large' = 64 px. */
  size?: ButtonSize;
  /** Atalho antigo para size="large". */
  large?: boolean;
  /** Ícone à esquerda do texto (decorativo: o nome vem do label). */
  icon?: IconName;
  /** Mostra "Aguarde…", desabilita e avisa o leitor de tela. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

const FG: Record<ButtonVariant, string> = {
  primary: color.onAlert,
  calm: color.onAccent,
  secondary: color.text,
  danger: color.danger,
  ghost: color.text,
};

/** Botão de 48 px (64 no large), raio 6, com retorno discreto ao toque. */
export function Button({
  label,
  variant = 'secondary',
  size,
  large = false,
  icon,
  busy = false,
  style,
  ...props
}: ButtonProps) {
  const { reduceMotion } = useMotion();
  const isLarge = size ? size === 'large' : large;
  const disabled = !!props.disabled || busy;
  const fg = FG[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      {...props}
      accessibilityState={{ ...props.accessibilityState, disabled, busy }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isLarge && styles.large,
        pressed && pressedStyle[variant],
        pressed && !reduceMotion && styles.pressScale,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon && !busy ? <Icon name={icon} size={isLarge ? 24 : 20} color={fg} /> : null}
        <Text
          style={[styles.text, { color: fg }, variant === 'ghost' && styles.textGhost, isLarge && styles.textLarge]}
        >
          {busy ? 'Aguarde…' : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: color.alert, borderColor: color.alert },
  calm: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: 'transparent', borderColor: color.borderStrong },
  danger: { backgroundColor: 'transparent', borderColor: color.danger },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: space.xs },
  large: { minHeight: 64, paddingHorizontal: space.lg },
  pressScale: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  text: {
    fontFamily: font.bodySemibold,
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.25),
    textAlign: 'center',
    flexShrink: 1,
  },
  textGhost: { fontFamily: font.bodyMedium, textDecorationLine: 'underline' },
  textLarge: { fontSize: fontSize.md, lineHeight: Math.round(fontSize.md * 1.25) },
});

/** Fundo ao tocar: um degrau acima no contorno; o cheio escurece um pouco. */
const pressedStyle = StyleSheet.create({
  primary: { opacity: 0.88 },
  calm: { opacity: 0.88 },
  secondary: { backgroundColor: color.surfaceRaised },
  danger: { backgroundColor: 'rgba(255, 143, 128, 0.12)' },
  ghost: { opacity: 0.7 },
});
