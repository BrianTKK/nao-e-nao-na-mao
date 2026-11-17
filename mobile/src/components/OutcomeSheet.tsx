import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALERT_OUTCOMES, OUTCOME_LABEL, type AlertOutcome } from '@nenm/shared';
import { Icon } from '@/components/Icon';
import { useMotion } from '@/hooks/useMotion';
import { color, font, fontSize, motion, radius, space, touchTarget, ui } from '@/theme/theme';

export type OutcomeSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Tocar num desfecho já encerra: a tela chama o servidor e fecha a folha se der certo. */
  onPick: (outcome: AlertOutcome) => void;
  /** Desfecho sendo salvo agora (mostra "Aguarde…" nele e trava os outros). */
  busy: AlertOutcome | null;
  error: string | null;
  note: string;
  onNoteChange: (note: string) => void;
};

/**
 * Folha "Como terminou?": sobe de baixo, com fundo escurecido e alça. Tocar
 * num desfecho encerra o alerta (com a observação, se escrita). Fecha pelo
 * botão Fechar, tocando no fundo, pelo Voltar do Android ou Esc na web.
 * Com "reduzir movimento", aparece sem subir.
 */
export function OutcomeSheet({ visible, onClose, onPick, busy, error, note, onNoteChange }: OutcomeSheetProps) {
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const [noteOpen, setNoteOpen] = useState(note.length > 0);
  const locked = busy !== null;

  // Ao abrir, o leitor de tela começa pelo título da folha.
  useEffect(() => {
    if (!visible) return;
    setNoteOpen(note.length > 0);
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => {
      if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [visible]);

  const close = () => {
    if (!locked) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            style={styles.backdrop}
            onPress={close}
            accessible={false}
            importantForAccessibility="no"
            aria-hidden
          />
        </Animated.View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.avoider} pointerEvents="box-none">
          <Animated.View
            entering={reduceMotion ? undefined : SlideInDown.duration(motion.duration.base)}
            style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}
            accessibilityViewIsModal
            aria-modal
            role="dialog"
            aria-labelledby="outcome-sheet-title"
          >
            <View style={styles.handle} aria-hidden importantForAccessibility="no" />

            <View style={styles.header}>
              <Text ref={titleRef} nativeID="outcome-sheet-title" style={[ui.h2, { flex: 1 }]} accessibilityRole="header">
                Como terminou?
              </Text>
              <Pressable
                onPress={close}
                disabled={locked}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                accessibilityState={{ disabled: locked }}
                hitSlop={4}
                style={({ pressed }) => [styles.close, pressed && { backgroundColor: color.surfaceRaised }]}
              >
                <Icon name="x" size={24} />
              </Pressable>
            </View>
            <Text style={ui.muted}>Tocar num desfecho encerra o alerta.</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {noteOpen ? (
                <View style={{ gap: space.xxs }}>
                  <Text style={ui.label} nativeID="note-label">
                    Observação (opcional, sem nomes)
                  </Text>
                  <TextInput
                    style={[ui.input, styles.note]}
                    multiline
                    maxLength={500}
                    value={note}
                    onChangeText={onNoteChange}
                    editable={!locked}
                    accessibilityLabelledBy="note-label"
                    accessibilityLabel="Observação"
                  />
                  <Text style={ui.muted}>Escreva antes de tocar no desfecho.</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => setNoteOpen(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.addNote, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="plus" size={20} color={color.accent} />
                  <Text style={[ui.link, { fontSize: fontSize.sm }]}>Escrever uma observação (opcional)</Text>
                </Pressable>
              )}

              {error && (
                <Text style={ui.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                  {error}
                </Text>
              )}

              <View style={{ gap: space.xs }}>
                {ALERT_OUTCOMES.map((o) => {
                  const saving = busy === o;
                  return (
                    <Pressable
                      key={o}
                      onPress={() => onPick(o)}
                      disabled={locked}
                      accessibilityRole="button"
                      accessibilityLabel={OUTCOME_LABEL[o]}
                      accessibilityHint="Encerra o alerta com este desfecho"
                      accessibilityState={{ disabled: locked, busy: saving }}
                      style={({ pressed }) => [
                        styles.option,
                        pressed && { backgroundColor: color.surfaceRaised },
                        locked && !saving && { opacity: 0.55 },
                      ]}
                    >
                      <Text style={styles.optionText}>{OUTCOME_LABEL[o]}</Text>
                      {saving ? (
                        <Text style={ui.muted}>Aguarde…</Text>
                      ) : (
                        <Icon name="chevron-right" size={20} color={color.textMuted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(5, 8, 7, 0.72)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    gap: space.xxs,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    marginBottom: space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  close: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.xs,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: space.md, paddingTop: space.sm },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: touchTarget },
  note: { minHeight: 80, textAlignVertical: 'top', paddingTop: space.xs },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
  },
  optionText: {
    flex: 1,
    color: color.text,
    fontFamily: font.bodyMedium,
    fontSize: fontSize.md,
    lineHeight: Math.round(fontSize.md * 1.3),
  },
});
