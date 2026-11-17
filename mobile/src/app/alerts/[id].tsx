import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  ALERT_OUTCOMES,
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
import { useMotion } from '@/hooks/useMotion';
import { useSession } from '@/hooks/useSession';
import { color, fontSize, motion, radius, space, ui } from '@/theme/theme';

const ERROR_TEXT: Partial<Record<DataError['code'], string>> = {
  already_taken: 'Outra pessoa da equipe já está indo.',
  invalid_transition: 'Este alerta já foi encerrado.',
  alert_not_found: 'Alerta não encontrado.',
  network: 'Sem conexão. Tente de novo quando o sinal voltar.',
};

/** Atender um alerta: ver, dizer "Estou indo" e registrar como terminou. */
export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { reduceMotion } = useMotion();
  const [alert, setAlert] = useState<Alert | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AlertOutcome | null>(null);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => setAlert(await dataSource.staff.getAlert(id)), [id]);

  useEffect(() => {
    load();
    // Abrir o alerta conta como "visto": o painel mede quanto tempo isso levou.
    dataSource.staff.ackAlert(id).catch(() => {});
    const stop = dataSource.staff.watchActiveAlerts(() => load());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, [id, load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err instanceof DataError && ERROR_TEXT[err.code]) || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  if (alert === undefined) return <View style={ui.screen} />;
  if (alert === null)
    return (
      <View style={[ui.screen, ui.content]}>
        <Text style={ui.body}>Alerta não encontrado.</Text>
        <Button label="Voltar" onPress={() => router.back()} />
      </View>
    );

  const mine = alert.responderId === me?.id;
  const active = isActive(alert.status);
  const statusColor = color.status[alert.status];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={[ui.card, { borderColor: statusColor, borderWidth: 3 }]}>
        <Text style={[ui.label, { color: statusColor }]} accessibilityLiveRegion="polite">
          {STATUS_LABEL[alert.status]}
          {alert.responderName ? ` · ${alert.responderName.split(' ')[0]}` : ''}
        </Text>
        <Text style={[ui.h1, { fontSize: fontSize.xxl }]} accessibilityRole="header">
          {alert.spotLabel}
        </Text>
        <Text style={ui.body}>{KIND_STAFF_LABEL[alert.kind]}</Text>
        <Text style={ui.muted}>Pediu há {formatDuration(elapsedSeconds(alert.createdAt, now), true)}</Text>
        <View style={{ marginTop: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: color.bg }}>
          <Text style={ui.muted}>Palavra para se apresentar</Text>
          <Text
            style={{ color: color.text, fontSize: fontSize.xxl, fontWeight: '700' }}
            adjustsFontSizeToFit
            numberOfLines={1}
            accessibilityLabel={`Palavra-código: ${spokenCode(alert.shortCode)}`}
          >
            {displayCode(alert.shortCode)}
          </Text>
          <Text style={ui.muted}>Diga a palavra a ela: é assim que ela sabe que você é da equipe.</Text>
        </View>
      </View>

      {error && (
        <Text style={ui.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      {active && alert.status !== 'on_the_way' && (
        <Button label="Estou indo" variant="primary" large busy={busy === 'go'} onPress={() => run('go', () => dataSource.staff.startResponse(alert.id))} />
      )}

      {active && alert.status === 'on_the_way' && !mine && (
        <Text style={ui.body}>{alert.responderName?.split(' ')[0]} já está indo. Fique por perto se precisar de apoio.</Text>
      )}

      {active && (alert.status === 'on_the_way' ? mine : true) && (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)} style={[ui.card, { gap: space.sm }]}>
          <Text style={ui.h2} accessibilityRole="header">
            Como terminou?
          </Text>
          <View accessibilityRole="radiogroup" style={{ gap: space.xs }}>
            {ALERT_OUTCOMES.map((o) => (
              <Button
                key={o}
                label={OUTCOME_LABEL[o]}
                variant={outcome === o ? 'primary' : 'secondary'}
                accessibilityRole="radio"
                accessibilityState={{ checked: outcome === o }}
                onPress={() => setOutcome(o)}
              />
            ))}
          </View>
          <Text style={ui.label} nativeID="note-label">
            Observação (opcional, sem nomes)
          </Text>
          <TextInput
            style={[ui.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: space.xs }]}
            multiline
            maxLength={500}
            value={note}
            onChangeText={setNote}
            accessibilityLabelledBy="note-label"
            accessibilityLabel="Observação"
          />
          <Button
            label="Registrar e encerrar"
            variant="primary"
            disabled={!outcome}
            busy={busy === 'done'}
            onPress={() => outcome && run('done', () => dataSource.staff.resolveAlert(alert.id, outcome, note))}
          />
        </Animated.View>
      )}

      {!active && (
        <View style={ui.card}>
          <Text style={ui.body}>{alert.outcome ? OUTCOME_LABEL[alert.outcome] : 'Alerta encerrado.'}</Text>
          <Button label="Voltar aos alertas" onPress={() => router.back()} />
        </View>
      )}
    </ScrollView>
  );
}
