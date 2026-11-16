import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, fontSize, motion, radius, space, touchTarget } from '@/theme/theme';
import { useMotion } from '@/hooks/useMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost';

/** Botão com área de toque de 48 px e retorno visual ao toque (encolhe um pouco). */
export function Button({
  label,
  variant = 'secondary',
  busy = false,
  large = false,
  ...props
}: PressableProps & { label: string; variant?: Variant; busy?: boolean; large?: boolean }) {
  const { reduceMotion } = useMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const disabled = props.disabled || busy;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      hitSlop={8}
      {...props}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduceMotion) scale.value = withTiming(0.96, { duration: motion.duration.fast });
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: reduceMotion ? 0 : motion.duration.fast });
        props.onPressOut?.(e);
      }}
      style={[styles.base, styles[variant], large && styles.large, disabled && styles.disabled, style]}
    >
      <Text style={[styles.text, variant === 'primary' && styles.textPrimary, large && styles.textLarge]}>
        {busy ? 'Aguarde…' : label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  secondary: { backgroundColor: color.surface, borderColor: color.borderStrong },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  large: { minHeight: 64 },
  disabled: { opacity: 0.6 },
  text: { color: color.text, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center' },
  textPrimary: { color: color.onAccent },
  textLarge: { fontSize: fontSize.lg },
});
