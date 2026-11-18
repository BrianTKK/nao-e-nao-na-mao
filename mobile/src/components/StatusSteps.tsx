import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { AlertStatus } from '@nenm/shared';
import { useMotion } from '@/hooks/useMotion';
import { color, motion, radius, space } from '@/theme/theme';

/** Quantas etapas o alerta já passou: visto, a caminho, encerrado. */
const REACHED: Record<AlertStatus, number> = { open: 0, seen: 1, on_the_way: 2, resolved: 3, cancelled: 0 };
const STEPS = [1, 2, 3] as const;
const FILL_MS = 420;
/** Quando o alerta pula mais de uma etapa de uma vez, elas enchem em sequência, da esquerda para a direita. */
const STAGGER_MS = 140;
/**
 * Trecho do toque que ainda não foi enviado: mais apagado, mas acima de 3:1 contra a trilha
 * (WCAG 1.4.11). Com 0,45 ficava em 2,3:1; com 0,7 o pior caso dá 3,5:1.
 */
const DIM_OPACITY = 0.7;

function Step({ filled, tone, dim, delay, animate }: { filled: boolean; tone: string; dim: boolean; delay: number; animate: boolean }) {
  const fill = useSharedValue(filled ? 1 : 0);
  // O atraso vale para a mudança que o definiu: não reinicia a animação se mudar depois.
  const wait = useRef(delay);
  wait.current = delay;
  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.value = animate
      ? withDelay(wait.current, withTiming(target, { duration: FILL_MS, easing: Easing.bezier(...motion.easing.standard) }))
      : target;
  }, [filled, animate, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: tone, opacity: dim ? DIM_OPACITY : 1 }, style]} />
    </View>
  );
}

/**
 * Motion de mudança de estado do alerta: três trechos (visto, a caminho,
 * encerrado) que enchem quando o alerta avança. A função é confirmar que o
 * toque teve efeito e mostrar em que ponto o atendimento está, sem a pessoa
 * precisar ler. Não anima ao abrir a tela, só quando o estado muda.
 *
 * - `confirmed`: o estado que o servidor já tem. O que passa dele (toque
 *   guardado sem sinal) aparece mais apagado; o aviso de "sem sinal" ao lado
 *   diz isso com texto e ícone, então a diferença não depende só da cor.
 * - Com "Reduzir movimento" (do sistema ou dos Ajustes), a troca é instantânea.
 * - Escondido do leitor de tela: o estado escrito acima já é a região viva.
 */
export function StatusSteps({ status, confirmed }: { status: AlertStatus; confirmed: AlertStatus }) {
  const { reduceMotion } = useMotion();
  const reached = REACHED[status];
  const sent = REACHED[confirmed];
  const previous = useRef(reached);
  const from = previous.current;
  useEffect(() => {
    previous.current = reached;
  }, [reached]);

  if (status === 'cancelled') return null;
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {STEPS.map((n) => (
        <Step
          key={n}
          filled={reached >= n}
          tone={color.status[status]}
          dim={n > sent}
          delay={Math.max(0, n - from - 1) * STAGGER_MS}
          animate={!reduceMotion}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xxs, marginTop: space.xs },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: color.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
