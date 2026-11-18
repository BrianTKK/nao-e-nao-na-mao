import { StyleSheet, Text, View } from 'react-native';
import { QUEUED_TITLE } from '@nenm/shared';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { color, radius, space, ui } from '@/theme/theme';

/**
 * Toque guardado sem sinal. O estado é dito com ícone (Wi-Fi riscado), título e
 * texto, nunca só com cor; a borda tracejada lembra "ainda não fechado". Para o
 * leitor de tela é uma região viva: aparece e é anunciado.
 */
export function QueuedNotice({ text, onRetry, retrying = false }: { text: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <View style={[styles.box, styles.queued]}>
      <Icon name="wifi-off" size={22} color={color.alert} />
      <View style={styles.body}>
        <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={`${QUEUED_TITLE}. ${text}`} style={styles.texts}>
          <Text style={[ui.body, ui.strong]}>{QUEUED_TITLE}</Text>
          <Text style={ui.muted}>{text}</Text>
        </View>
        {onRetry && (
          <Button
            label="Tentar enviar agora"
            variant="secondary"
            busy={retrying}
            onPress={onRetry}
            style={styles.action}
          />
        )}
      </View>
    </View>
  );
}

/** Toque guardado que não foi aplicado: outra pessoa agiu antes. Fica até a pessoa tocar em "Entendi". */
export function NotSentNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <View style={[styles.box, styles.notSent]}>
      <Icon name="alert-circle" size={22} color={color.danger} />
      <View style={styles.body}>
        <View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive" accessibilityLabel={text} style={styles.texts}>
          <Text style={[ui.body, ui.strong]}>{text}</Text>
        </View>
        <Button label="Entendi" variant="secondary" onPress={onDismiss} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
  },
  queued: { borderWidth: 1.5, borderColor: color.alert, borderStyle: 'dashed' },
  notSent: { borderWidth: 1.5, borderColor: color.danger },
  body: { flex: 1, gap: space.xs },
  texts: { gap: space.xxs },
  action: { alignSelf: 'flex-start' },
});
