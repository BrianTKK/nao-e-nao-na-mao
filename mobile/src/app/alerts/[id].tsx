import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DataError,
  KIND_STAFF_LABEL,
  OUTCOME_LABEL,
  STATUS_LABEL,
  elapsedSeconds,
  formatDuration,
  isActive,
  type Alert,
  type AlertOutcome,
  displayCode,
  spokenCode,
} from '@nenm/shared';
import { dataSource } from '@/data/source';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { STATUS_ICON } from '@/components/AlertCard';
import { OutcomeSheet } from '@/components/OutcomeSheet';
import { Perforation, TicketNotches, useNotchY } from '@/components/TicketNotches';
import { useSession } from '@/hooks/useSession';
import { color, font, fontSize, radius, space, ui } from '@/theme/theme';

const ERROR_TEXT: Partial<Record<DataError['code'], string>> = {
  already_taken: 'Outra pessoa da equipe já está indo.',
  invalid_transition: 'Este alerta já foi encerrado.',
  alert_not_found: 'Alerta não encontrado.',
  network: 'Sem conexão. Tente de novo quando o sinal voltar.',
};

const first = (name: string | null | undefined) => name?.split(' ')[0] ?? null;

/** Quem está cuidando do alerta, com o ícone do estado. */
function whoLine(a: Alert, mine: boolean, meId: string | null): { icon: IconName; text: string; tone: string } | null {
  if (a.responderName && !isActive(a.status))
    return { icon: 'user', text: mine ? 'Atendido por você' : `Atendido por ${first(a.responderName)}`, tone: color.text };
  if (a.responderName)
    return {
      icon: 'walking',
      text: mine ? 'Você está indo até ela' : `${first(a.responderName)} está indo até ela`,
      tone: color.status.on_the_way,
    };
  if (!isActive(a.status)) return null;
  if (a.assignedToName) {
    const by = first(a.assignedByName) ?? 'A gerência';
    return a.assignedToId === meId
      ? { icon: 'user', text: `${by} pediu que você vá`, tone: color.alert }
      : { icon: 'user', text: `${by} mandou ${first(a.assignedToName)}; esperando o "Estou indo"`, tone: color.text };
  }
  if (a.status === 'seen') return { icon: 'eye', text: 'Visto; ninguém foi ainda', tone: color.text };
  return { icon: 'alert', text: 'Ninguém viu ainda', tone: color.alert };
}

/**
 * Atender um alerta: ver, dizer "Estou indo" e registrar como terminou.
 * Em cima, lugar e motivo; no meio, a palavra-código num tíquete; embaixo,
 * uma barra fixa com a ação principal ao alcance do polegar. "Encerrar…" abre
 * a folha de desfechos.
 */
export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState<Alert | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const [notchY, onPerforationLayout] = useNotchY();

  const load = useCallback(async () => setAlert(await dataSource.staff.getAlert(id)), [id]);

  useEffect(() => {
    load();
    // Abrir o alerta conta como "visto": o painel mede quanto tempo isso levou,
    // e o alarme deste alerta para (useActiveAlerts silencia o que deixou de ser novo).
    dataSource.staff.ackAlert(id).catch(() => {});
    const stop = dataSource.staff.watchActiveAlerts(() => load());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, [id, load]);

  const active = alert ? isActive(alert.status) : false;

  // Se o alerta for encerrado por outra pessoa com a folha aberta, a folha fecha.
  useEffect(() => {
    if (alert && !active) setSheetOpen(false);
  }, [alert, active]);

  /** Salva e recarrega. Devolve se deu certo. */
  const run = async (key: string, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError((err instanceof DataError && ERROR_TEXT[err.code]) || 'Não foi possível salvar. Tente de novo.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (alert === undefined) return <View style={ui.screen} />;
  if (alert === null)
    return (
      <View style={[ui.screen, ui.content]}>
        <Text style={ui.body}>Alerta não encontrado.</Text>
        <Button label="Voltar" icon="arrow-left" onPress={() => router.back()} />
      </View>
    );

  const mine = !!me && alert.responderId === me.id;
  const statusColor = color.status[alert.status];
  const who = whoLine(alert, mine, me?.id ?? null);
  const canGo = active && alert.status !== 'on_the_way';
  const canResolve = active && (alert.status === 'on_the_way' ? mine : true);
  const othersGoing = active && alert.status === 'on_the_way' && !mine;

  const pick = async (o: AlertOutcome) => {
    const ok = await run(`done:${o}`, () => dataSource.staff.resolveAlert(alert.id, o, note));
    if (!ok) return;
    setSheetOpen(false);
    setNote('');
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(`Alerta encerrado: ${OUTCOME_LABEL[o]}.`);
  };

  const openSheet = () => {
    setError(null);
    setSheetOpen(true);
  };

  return (
    <View style={ui.screen}>
      <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { paddingBottom: space.lg }]}>
        <View style={{ gap: space.xxs }}>
          <View style={styles.statusRow}>
            <Icon name={STATUS_ICON[alert.status]} size={20} color={statusColor} />
            {/* Só o estado é região viva: o tempo muda a cada segundo e não deve ser anunciado. */}
            <Text style={[styles.statusText, { color: statusColor }]} accessibilityLiveRegion="polite">
              {STATUS_LABEL[alert.status]}
            </Text>
            <Text style={[ui.num, styles.time]}>· há {formatDuration(elapsedSeconds(alert.createdAt, now), true)}</Text>
          </View>
          <Text style={[ui.display, styles.place]} accessibilityRole="header">
            {alert.spotLabel}
          </Text>
          <Text style={ui.body}>{KIND_STAFF_LABEL[alert.kind]}</Text>
        </View>

        <View style={styles.ticket}>
          <Text style={ui.labelCaps}>Diga esta palavra a ela</Text>
          <Text
            style={[ui.display, styles.word]}
            adjustsFontSizeToFit
            numberOfLines={1}
            accessibilityLabel={`Palavra-código: ${spokenCode(alert.shortCode)}`}
          >
            {displayCode(alert.shortCode)}
          </Text>
          <Perforation onLayout={onPerforationLayout} style={{ marginVertical: space.sm }} />
          <Text style={ui.muted}>É assim que ela sabe que você é da equipe.</Text>
          <TicketNotches y={notchY} borderWidth={1} borderColor={color.border} />
        </View>

        {who && (
          <View style={styles.whoRow}>
            <Icon name={who.icon} size={22} color={who.tone === color.text ? color.textMuted : who.tone} />
            <Text style={[ui.body, ui.strong, { flex: 1 }]}>{who.text}</Text>
          </View>
        )}

        {othersGoing && <Text style={ui.muted}>Fique por perto se precisar de apoio.</Text>}

        {!active && (
          <View style={[ui.card, styles.result]}>
            <Icon name="check-circle" size={24} color={color.status.resolved} />
            <View style={{ flex: 1, gap: space.xxs }}>
              <Text style={ui.labelCaps}>Encerrado</Text>
              <Text style={ui.body}>{alert.outcome ? OUTCOME_LABEL[alert.outcome] : 'Alerta encerrado.'}</Text>
              {alert.note ? <Text style={ui.muted}>{alert.note}</Text> : null}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        {error && !sheetOpen && (
          <Text style={ui.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {canGo && (
          <Button
            label="Estou indo"
            variant="primary"
            size="large"
            icon="walking"
            busy={busy === 'go'}
            onPress={() => run('go', () => dataSource.staff.startResponse(alert.id))}
          />
        )}
        {canResolve && (
          <Button
            label="Encerrar…"
            accessibilityLabel="Encerrar: escolher como terminou"
            variant={canGo ? 'secondary' : 'calm'}
            size={canGo ? 'default' : 'large'}
            icon={canGo ? undefined : 'check'}
            disabled={busy === 'go'}
            onPress={openSheet}
          />
        )}
        {(!active || othersGoing) && (
          <Button
            label="Voltar aos alertas"
            icon="arrow-left"
            variant={active ? 'secondary' : 'calm'}
            size={active ? 'default' : 'large'}
            onPress={() => router.back()}
          />
        )}
      </View>

      <OutcomeSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={pick}
        busy={busy?.startsWith('done:') ? (busy.slice(5) as AlertOutcome) : null}
        error={sheetOpen ? error : null}
        note={note}
        onNoteChange={setNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  statusText: {
    fontFamily: font.bodySemibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
  },
  time: { color: color.textMuted, fontSize: fontSize.md },
  place: { fontSize: fontSize.xxl, lineHeight: Math.round(fontSize.xxl * 1.1), marginTop: space.xxs },
  ticket: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xxs,
  },
  word: { fontSize: 40, lineHeight: 50 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bar: {
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
});
