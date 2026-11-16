import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { KIND_STAFF_LABEL, STATUS_LABEL, elapsedSeconds, formatDuration, type Alert } from '@nenm/shared';
import { color, fontSize, motion, radius, space } from '@/theme/theme';
import { useMotion } from '@/hooks/useMotion';

const ICON: Record<Alert['status'], string> = { open: '●', seen: '◉', on_the_way: '➜', resolved: '✓', cancelled: '×' };

/**
 * Cartão de pedido. Pedido novo pulsa (borda e brilho) até alguém ver: o bar
 * é escuro e barulhento, e o alerta precisa saltar aos olhos. Com "reduzir
 * movimento", a borda fica grossa e parada.
 */
export function AlertCard({ alert, now, onPress }: { alert: Alert; now: number; onPress: () => void }) {
  const { reduceMotion } = useMotion();
  const pulse = useSharedValue(0);
  const isNew = alert.status === 'open';

  useEffect(() => {
    if (isNew && !reduceMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: motion.duration.pulse / 2 }),
          withTiming(0, { duration: motion.duration.pulse / 2 }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [isNew, reduceMotion, pulse]);

  const animated = useAnimatedStyle(() => ({
    shadowOpacity: 0.2 + pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.015 }],
  }));

  const statusColor = color.status[alert.status];
  const waited = formatDuration(elapsedSeconds(alert.createdAt, now), true);
  const label = `${STATUS_LABEL[alert.status]}. ${alert.spotLabel}. ${KIND_STAFF_LABEL[alert.kind]}. Há ${waited}. Código ${alert.shortCode.split('').join(' ')}.`;

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(motion.duration.base)} style={[styles.shadow, animated]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Abre o pedido para atender"
        style={[styles.card, { borderColor: statusColor, borderWidth: isNew ? 4 : 2 }]}
      >
        <View style={styles.row}>
          <Text style={[styles.status, { color: statusColor }]}>
            {ICON[alert.status]} {STATUS_LABEL[alert.status]}
          </Text>
          <Text style={styles.time}>há {waited}</Text>
        </View>
        <Text style={styles.spot}>{alert.spotLabel}</Text>
        <Text style={styles.kind}>{KIND_STAFF_LABEL[alert.kind]}</Text>
        <Text style={styles.code}>
          Código {alert.shortCode}
          {alert.responderName ? ` · ${alert.responderName.split(' ')[0]} a caminho` : ''}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowColor: color.status.open, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, borderRadius: radius.lg },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.md, gap: space.xxs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: fontSize.sm, fontWeight: '700' },
  time: { color: color.textMuted, fontSize: fontSize.sm },
  spot: { color: color.text, fontSize: fontSize.xl, fontWeight: '700' },
  kind: { color: color.text, fontSize: fontSize.md },
  code: { color: color.textMuted, fontSize: fontSize.sm },
});
