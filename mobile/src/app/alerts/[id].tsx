import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DataError,
  KIND_STAFF_LABEL,
  OUTCOME_LABEL,
  STATUS_LABEL,
  applyPending,
  elapsedSeconds,
  formatDuration,
  isActive,
  notSentText,
  QUEUED_TITLE,
  noticesFor,
  pendingFor,
  queuedText,
  settledFor,
  type Alert,
  type AlertOutcome,
  type QueuedActionKind,
  displayCode,
  spokenCode,
} from '@nenm/shared';
import { dataSource } from '@/data/source';
import { outbox } from '@/data/outbox';
import { recallAlert, rememberAlerts } from '@/data/alertCache';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { STATUS_ICON } from '@/components/AlertCard';
import { NotSentNotice, QueuedNotice } from '@/components/OutboxNotices';
import { OutcomeSheet } from '@/components/OutcomeSheet';
import { StatusSteps } from '@/components/StatusSteps';
import { Perforation, TicketNotches, useNotchY } from '@/components/TicketNotches';
import { fitFontSize, useFitFont } from '@/hooks/useFitFont';
import { useMotion } from '@/hooks/useMotion';
import { useOutbox } from '@/hooks/useOutbox';
import { useSession } from '@/hooks/useSession';
import { color, font, fontSize, motion, radius, space, ui } from '@/theme/theme';

const ERROR_TEXT: Partial<Record<DataError['code'], string>> = {
  already_taken: 'Outra pessoa da equipe já está indo.',
  invalid_transition: 'Este alerta já foi encerrado.',
  alert_not_found: 'Alerta não encontrado.',
  not_staff: 'O seu login venceu. Entre de novo para continuar.',
};

const first = (name: string | null | undefined) => name?.split(' ')[0] ?? null;

/**
 * Sem leitura do servidor há este tempo (ex.: o socket caiu e o HTTP segue), o toque vai como "guardado":
 * a pessoa pode não ter visto o que mudou, e o encerramento não passa por cima de quem assumiu.
 */
const READ_STALE_MS = 30_000;

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
 *
 * Sem sinal, a tela continua funcionando: abre com o último estado conhecido, e
 * os toques ficam guardados na fila (data/outbox.ts). A tela mostra o alerta
 * como ele vai ficar e avisa, com ícone e texto, que ainda não foi enviado. Se,
 * na volta do sinal, outra pessoa já tiver assumido ou encerrado, o toque não
 * passa por cima: vira um aviso e a tela mostra o que vale.
 */
export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  /** O alerta como o servidor mandou por último (ou o que a lista já conhecia, se não há sinal). */
  const [server, setServer] = useState<Alert | null | undefined>(() => recallAlert(id));
  /** A última leitura falhou (sem sinal): o que está na tela pode estar desatualizado. */
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const [notchY, onPerforationLayout] = useNotchY();
  const [wordWidth, setWordWidth] = useState(0);
  /** Hora da última leitura do servidor que deu certo nesta tela (null: a tela ainda mostra o que a lista sabia). */
  const lastRead = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await dataSource.staff.getAlert(id);
      if (fresh) rememberAlerts([fresh]);
      lastRead.current = Date.now();
      setServer(fresh);
      setStale(false);
    } catch {
      // Sem sinal: fica o que já se sabia (a lista guarda o último estado de cada alerta).
      setStale(true);
      setServer((current) => current ?? recallAlert(id));
    }
  }, [id]);

  useEffect(() => {
    load();
    const stop = dataSource.staff.watchActiveAlerts(() => load());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, [id, load]);

  // Abrir o alerta conta como "visto": o painel mede quanto tempo isso levou,
  // e o alarme deste alerta para (useActiveAlerts silencia o que deixou de ser novo).
  // Sem sinal, o "visto" também fica guardado na fila.
  const meId = me?.id;
  useEffect(() => {
    if (meId) outbox.perform({ kind: 'ack', alertId: id, userId: meId }).catch(() => {});
  }, [id, meId]);

  // Toques meus guardados sem sinal e avisos do que não foi aplicado, deste alerta.
  const box = useOutbox();
  const pending = pendingFor(box, meId, id);
  const notSent = noticesFor(box, meId, id);
  const queuedKinds = pending.map((a) => a.kind).filter((k): k is QueuedActionKind => k !== 'ack');
  // Os toques que o servidor acabou de aceitar seguem aplicados até a leitura mostrar o novo estado (uma
  // leitura que saiu antes do envio e chegou depois não desfaz o toque na tela).
  const settled = settledFor(box, meId, id, now);
  /** O que o servidor já tem: a última leitura com os toques aceitos depois dela. */
  const confirmed = server && me && settled.length ? applyPending(server, settled, me) : server;
  const alert = confirmed && me && pending.length ? applyPending(confirmed, pending, me) : confirmed;
  /** O estado na tela ainda não chegou ao servidor: é o que os toques guardados vão deixar. */
  const unsent = !!alert && !!confirmed && queuedKinds.length > 0 && alert.status !== confirmed.status;
  // O nome do lugar também encolhe em tela estreita, em vez de quebrar no meio da palavra.
  const place = useFitFont(alert?.spotLabel ?? '', fontSize.xxl, 22);

  // Quando a fila anda (enviou ou descartou), busca o que vale agora no servidor.
  const boxMark = `${pending.length}:${notSent.length}`;
  const lastMark = useRef(boxMark);
  useEffect(() => {
    if (lastMark.current === boxMark) return;
    lastMark.current = boxMark;
    load();
  }, [boxMark, load]);

  const active = alert ? isActive(alert.status) : false;

  // Mudança de estado depois de a tela abrir: é quando o motion entra, com um toque no aparelho.
  const status = alert?.status;
  const lastStatus = useRef(status);
  // Liga depois que o alerta apareceu pela primeira vez: o que monta a partir daí é mudança e entra com
  // motion, já na primeira (a view nova precisa nascer com `entering`).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (status) setShown(true);
  }, [status]);
  const unsentRef = useRef(unsent);
  unsentRef.current = unsent;
  useEffect(() => {
    if (status === lastStatus.current) return;
    const first = lastStatus.current === undefined;
    lastStatus.current = status;
    if (first || !status || Platform.OS === 'web') return;
    // Toque guardado sem sinal: um toque leve, não o de "deu certo" (o servidor ainda não sabe).
    if (unsentRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else if (status === 'resolved') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (status === 'on_the_way') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [status]);
  const entering = !reduceMotion && shown;

  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (!meId) return;
    setRetrying(true);
    await outbox.flush(meId).catch(() => {});
    setRetrying(false);
  };

  // Se o alerta for encerrado por outra pessoa com a folha aberta, a folha fecha.
  useEffect(() => {
    if (alert && !active) setSheetOpen(false);
  }, [alert, active]);

  /**
   * Faz o toque passar pela fila e recarrega. Devolve 'sent' (o servidor aplicou),
   * 'queued' (sem sinal: ficou guardado) ou null (o servidor recusou; o erro vai para a tela).
   */
  const run = async (key: string, action: { kind: QueuedActionKind; outcome?: AlertOutcome; note?: string }): Promise<'sent' | 'queued' | null> => {
    if (!me || !alert) return null;
    setBusy(key);
    setError(null);
    try {
      // `stale`: a última leitura falhou, ainda não houve leitura nesta tela (ela abriu com o que a lista
      // sabia) ou a última é antiga. A pessoa pode não ter visto o que mudou: o servidor trata o toque como
      // guardado e não o deixa passar por cima de quem assumiu.
      const outdated = stale || lastRead.current === null || Date.now() - lastRead.current > READ_STALE_MS;
      const result = await outbox.perform({ ...action, alertId: alert.id, userId: me.id, spotLabel: alert.spotLabel, stale: outdated });
      if (result === 'sent') await load();
      // Guardado sem sinal: no Android o aviso da tela é região viva e já é anunciado. No iPhone não
      // existe região viva, então o VoiceOver precisa do anúncio.
      else if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${QUEUED_TITLE}.`);
      return result;
    } catch (err) {
      setError((err instanceof DataError && ERROR_TEXT[err.code]) || 'Não foi possível salvar. Tente de novo.');
      // Recusado: mostra o que vale agora (ex.: quem assumiu).
      load();
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (alert === undefined)
    return (
      <View style={[ui.screen, ui.content]}>
        {!stale && (
          <View style={styles.whoRow} accessible accessibilityRole="text" accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.accent} />
            <Text style={[ui.body, { flex: 1 }]}>Carregando o alerta…</Text>
          </View>
        )}
        {stale && (
          <View style={styles.whoRow} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="wifi-off" size={22} color={color.alert} />
            <Text style={[ui.body, { flex: 1 }]}>Sem sinal: não deu para abrir este alerta. O app tenta de novo sozinho quando a conexão voltar.</Text>
          </View>
        )}
        {stale && <Button label="Voltar" icon="arrow-left" onPress={() => router.back()} />}
      </View>
    );
  if (alert === null)
    return (
      <View style={[ui.screen, ui.content]}>
        <Text style={ui.body}>Alerta não encontrado.</Text>
        <Button label="Voltar" icon="arrow-left" onPress={() => router.back()} />
      </View>
    );

  // A palavra tem de aparecer inteira e numa linha só, mesmo numa tela estreita ou com fonte grande. O
  // `adjustsFontSizeToFit` só funciona no Android, então o tamanho também sai da largura que sobra.
  const wordSize = fitFontSize(displayCode(alert.shortCode), wordWidth, 40, 16, 0.72);

  const mine = !!me && alert.responderId === me.id;
  const statusColor = color.status[alert.status];
  const who = whoLine(alert, mine, me?.id ?? null);
  const canGo = active && alert.status !== 'on_the_way';
  const canResolve = active && (alert.status === 'on_the_way' ? mine : true);
  const othersGoing = active && alert.status === 'on_the_way' && !mine;

  const pick = async (o: AlertOutcome) => {
    const result = await run(`done:${o}`, { kind: 'resolve', outcome: o, note });
    if (!result) return;
    setSheetOpen(false);
    setNote('');
    if (result === 'sent' && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(`Alerta encerrado: ${OUTCOME_LABEL[o]}.`);
  };

  const openSheet = () => {
    setError(null);
    setSheetOpen(true);
  };

  return (
    <View style={ui.screen}>
      <ScrollView
        style={ui.screen}
        contentContainerStyle={[ui.content, { paddingBottom: space.lg }]}
        // Na web, uma área que rola precisa de foco para o teclado (WCAG 2.1.1). No Android o foco não entra.
        {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : null)}
      >
        {notSent.map((n) => (
          <NotSentNotice key={n.id} text={notSentText(n)} onDismiss={() => outbox.dismissNotice(n.id)} />
        ))}

        <View style={{ gap: space.xxs }}>
          {/* A região viva fica fixa e só o que está dentro dela troca (a chave): o leitor de tela anuncia
              o estado novo, e o olho vai para o que mudou. Se a própria região fosse recriada, nada seria dito. */}
          <View style={styles.statusRow}>
            <View accessibilityLiveRegion="polite" style={styles.statusLive}>
              <Animated.View key={alert.status} entering={entering ? FadeInDown.duration(motion.duration.base) : undefined} style={styles.statusLive}>
                <Icon name={STATUS_ICON[alert.status]} size={20} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {STATUS_LABEL[alert.status]}
                  {unsent ? ', ainda não enviado' : ''}
                </Text>
              </Animated.View>
            </View>
            {/* O tempo muda a cada segundo e não deve ser anunciado: fica fora da região viva. */}
            <Text style={[ui.num, styles.time]}>· há {formatDuration(elapsedSeconds(alert.createdAt, now), true)}</Text>
          </View>
          <StatusSteps status={alert.status} confirmed={confirmed?.status ?? alert.status} />
          <Text
            style={[ui.display, styles.place, { fontSize: place.size, lineHeight: Math.round(place.size * 1.1) }]}
            onLayout={place.onLayout}
            accessibilityRole="header"
          >
            {alert.spotLabel}
          </Text>
          <Text style={ui.body}>{KIND_STAFF_LABEL[alert.kind]}</Text>
        </View>

        <View style={styles.ticket}>
          <Text style={ui.labelCaps}>Diga esta palavra a ela</Text>
          <Text
            style={[ui.display, styles.word, { fontSize: wordSize, lineHeight: Math.round(wordSize * 1.25) }]}
            adjustsFontSizeToFit
            numberOfLines={1}
            onLayout={(e) => setWordWidth(e.nativeEvent.layout.width)}
            accessibilityLabel={`Palavra-código: ${spokenCode(alert.shortCode)}`}
          >
            {displayCode(alert.shortCode)}
          </Text>
          <Perforation onLayout={onPerforationLayout} style={{ marginVertical: space.sm }} />
          <Text style={ui.muted}>É assim que ela sabe que você é da equipe.</Text>
          <TicketNotches y={notchY} borderWidth={1} borderColor={color.border} />
        </View>

        {who && (
          // Quem está cuidando também é anunciado quando muda (região viva fixa, conteúdo trocado pela chave).
          <View accessibilityLiveRegion="polite">
            <Animated.View key={who.text} entering={entering ? FadeIn.duration(motion.duration.base) : undefined} style={styles.whoRow}>
              <Icon name={who.icon} size={22} color={who.tone === color.text ? color.textMuted : who.tone} />
              <Text style={[ui.body, ui.strong, { flex: 1 }]}>{who.text}</Text>
            </Animated.View>
          </View>
        )}

        {othersGoing && <Text style={ui.muted}>Fique por perto se precisar de apoio.</Text>}

        {queuedKinds.length > 0 && <QueuedNotice text={queuedText(queuedKinds)} onRetry={retry} retrying={retrying} />}

        {stale && queuedKinds.length === 0 && active && (
          <View style={styles.whoRow} accessible accessibilityRole="text">
            <Icon name="wifi-off" size={22} color={color.textMuted} />
            <Text style={[ui.muted, { flex: 1 }]}>
              Sem sinal: esta tela pode estar desatualizada. Você pode tocar assim mesmo; o app envia quando o sinal voltar.
            </Text>
          </View>
        )}

        {!active && (
          <Animated.View entering={entering ? FadeInDown.duration(motion.duration.base) : undefined} style={[ui.card, styles.result]}>
            <Icon name="check-circle" size={24} color={color.status.resolved} />
            <View style={styles.resultText}>
              <Text style={ui.labelCaps}>{unsent ? 'Encerramento guardado: ainda não enviado' : 'Encerrado'}</Text>
              <Text style={ui.body}>{alert.outcome ? OUTCOME_LABEL[alert.outcome] : 'Alerta encerrado.'}</Text>
              {alert.note ? <Text style={ui.muted}>{alert.note}</Text> : null}
            </View>
          </Animated.View>
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
            onPress={() => run('go', { kind: 'start' })}
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
  // `flexShrink`: em tela estreita o estado quebra em duas linhas ("A caminho, ainda não enviado") em vez de sair da tela.
  statusLive: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  statusText: {
    flexShrink: 1,
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
  // `flexWrap`: com fonte grande o ícone fica em cima e o texto ocupa a largura toda, sem quebrar palavra no meio.
  result: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.sm },
  resultText: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: space.xxs },
  bar: {
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
});
