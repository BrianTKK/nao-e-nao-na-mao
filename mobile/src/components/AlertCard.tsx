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
import {
  KIND_STAFF_LABEL,
  displayCode,
  spokenCode,
  STATUS_LABEL,
  elapsedSeconds,
  formatDuration,
  type Alert,
  type AlertStatus,
} from '@nenm/shared';
import { color, font, fontSize, motion, radius, space, ui } from '@/theme/theme';
import { useMotion } from '@/hooks/useMotion';
import { Icon, type IconName } from '@/components/Icon';
import { Perforation, TicketNotches, useNotchY } from '@/components/TicketNotches';

/** Forma de cada estado (o estado nunca depende só da cor), a mesma da web. */
export const STATUS_ICON: Record<AlertStatus, IconName> = {
  open: 'alert',
  seen: 'eye',
  on_the_way: 'walking',
  resolved: 'check',
  cancelled: 'x',
};

/** Tinta do picote sobre o latão: o texto escuro a 45%, como na web. */
export const PERFORATION_ON_ALERT = 'rgba(26, 18, 0, 0.45)';

/**
 * Cartão de alerta da lista.
 * - Alerta novo (ou mandado para mim e ainda sem "Estou indo"): o único bloco
 *   cheio de latão da tela, em forma de tíquete (picote e dois entalhes), com
 *   um halo que pulsa até alguém ver. Com "reduzir movimento", sem pulso.
 * - Os outros estados: cartão escuro com faixa lateral na cor do estado, e o
 *   estado escrito com ícone (olho, pessoa andando, check).
 */
export function AlertCard({ alert, now, meId, onPress }: { alert: Alert; now: number; meId: string | null; onPress: () => void }) {
  const { reduceMotion } = useMotion();
  const pulse = useSharedValue(0);
  const forMe = !alert.responderId && !!meId && alert.assignedToId === meId;
  const isNew = alert.status === 'open' || forMe;
  const [notchY, onPerforationLayout] = useNotchY();

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

  const halo = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.9,
    transform: [{ scale: 1 + pulse.value * 0.012 }],
  }));

  const statusColor = color.status[alert.status];
  const assignedText = alert.responderId
    ? null
    : forMe
      ? `${alert.assignedByName?.split(' ')[0] ?? 'A gerência'} pediu que você vá`
      : alert.assignedToName
        ? `Direcionado para ${alert.assignedToName.split(' ')[0]}`
        : null;
  const waited = formatDuration(elapsedSeconds(alert.createdAt, now), true);
  const responder = alert.responderName ? `${alert.responderName.split(' ')[0]} a caminho` : null;
  const statusText = STATUS_LABEL[alert.status];
  const label = `${assignedText ? `${assignedText}. ` : ''}${statusText}. ${alert.spotLabel}. ${KIND_STAFF_LABEL[alert.kind]}. Há ${waited}. Palavra ${spokenCode(alert.shortCode)}.${responder ? ` ${responder}.` : ''}`;

  const ink = isNew ? color.onAlert : color.text;
  const inkMuted = isNew ? color.onAlert : color.textMuted;
  const tone = isNew ? color.onAlert : statusColor;

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(motion.duration.slow)}>
      {isNew && !reduceMotion && <Animated.View pointerEvents="none" style={[styles.halo, halo]} aria-hidden />}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Abre o alerta para atender"
        style={({ pressed }) => [isNew ? styles.ticket : [styles.card, { borderLeftColor: statusColor }], pressed && styles.pressed]}
      >
        <View style={styles.top}>
          <View style={styles.status}>
            <Icon name={STATUS_ICON[alert.status]} size={20} color={tone} />
            <Text style={[styles.statusText, { color: tone }]}>{statusText}</Text>
          </View>
          <Text style={[ui.num, styles.time, { color: inkMuted }]}>há {waited}</Text>
        </View>

        {assignedText && <Text style={[styles.assigned, { color: inkMuted }]}>{assignedText}</Text>}

        <Text style={[ui.display, isNew ? styles.spotNew : styles.spot, { color: ink }]}>{alert.spotLabel}</Text>
        <Text style={[styles.kind, { color: ink }]}>{KIND_STAFF_LABEL[alert.kind]}</Text>

        {isNew ? (
          <Perforation tint={PERFORATION_ON_ALERT} onLayout={onPerforationLayout} style={styles.perforation} />
        ) : (
          <View style={[ui.rule, styles.perforation]} />
        )}

        <View style={styles.bottom}>
          <Text style={[styles.word, { color: inkMuted }]} numberOfLines={2}>
            Palavra: <Text style={[ui.display, styles.wordValue, { color: ink }]}>{displayCode(alert.shortCode)}</Text>
            {responder ? `  ·  ${responder}` : null}
          </Text>
          <Icon name="chevron-right" size={22} color={inkMuted} />
        </View>

        {isNew && <TicketNotches y={notchY} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: radius.lg + 5,
    borderWidth: 3,
    borderColor: color.alert,
  },
  ticket: {
    backgroundColor: color.alert,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xxs,
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    borderLeftWidth: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.xxs,
  },
  pressed: { opacity: 0.88 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  statusText: {
    fontFamily: font.bodySemibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
  },
  time: { fontSize: fontSize.md },
  assigned: { fontFamily: font.bodySemibold, fontSize: fontSize.sm },
  spotNew: { fontSize: fontSize.xxl, lineHeight: Math.round(fontSize.xxl * 1.1), marginTop: space.xxs },
  spot: { fontSize: fontSize.xl, lineHeight: Math.round(fontSize.xl * 1.15), marginTop: space.xxs },
  kind: { fontFamily: font.body, fontSize: fontSize.md, lineHeight: Math.round(fontSize.md * 1.35) },
  perforation: { marginVertical: space.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  word: { fontFamily: font.body, fontSize: fontSize.sm, flexShrink: 1 },
  wordValue: { fontSize: fontSize.lg },
});
