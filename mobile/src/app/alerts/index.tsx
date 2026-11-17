import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import type { ConnectionState } from '@nenm/shared';
import { Button } from '@/components/Button';
import { AlertCard } from '@/components/AlertCard';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { takePendingAlert } from '@/notifications/openAlert';
import { useSession } from '@/hooks/useSession';
import { dataSource, showDemo, simulateAlert } from '@/data/source';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { space, ui } from '@/theme/theme';

/** "Reconectando…" só aparece se durar: a ligação inicial leva um instante. */
const CONNECTING_GRACE_MS = 4000;

/**
 * Mostra o aviso de conexão só quando ela falta. Sem conexão: na hora.
 * Reconectando: depois de alguns segundos. Conectado: nada (é o normal).
 */
function useConnectionTrouble(): boolean {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => dataSource.watchConnection(setState), []);
  useEffect(() => {
    setGraceOver(false);
    if (state !== 'connecting') return;
    const t = setTimeout(() => setGraceOver(true), CONNECTING_GRACE_MS);
    return () => clearTimeout(t);
  }, [state]);
  return state === 'offline' || (state === 'connecting' && graceOver);
}

const countText = (n: number) => (n === 1 ? '1 alerta em aberto' : `${n} alertas em aberto`);

/** Alertas abertos do bar, do mais antigo ao mais novo (quem espera há mais tempo, primeiro). */
export default function Alerts() {
  const { me } = useSession();
  const alerts = useActiveAlerts(me?.id ?? null);
  const connectionTrouble = useConnectionTrouble();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (me === null) router.replace('/login');
  }, [me]);

  // Toque na notificação com o app fechado: abre o alerta agora que o app está pronto e com login.
  useEffect(() => {
    if (!me) return;
    const pending = takePendingAlert();
    if (pending) router.push({ pathname: '/alerts/[id]', params: { id: pending } });
  }, [me]);

  return (
    <View style={ui.screen}>
      <Stack.Screen
        options={{
          headerRight: () => <Button label="Ajustes" variant="ghost" onPress={() => router.push('/settings')} />,
        }}
      />
      <FlatList
        data={alerts ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[ui.content, { flexGrow: 1, paddingBottom: space.xl }]}
        ListHeaderComponent={
          <View style={{ gap: space.xs }}>
            {connectionTrouble && <ConnectionBanner />}
            {me ? (
              <Text style={ui.muted}>
                <Text style={ui.strong}>{me.fullName.split(' ')[0]}</Text>
                {` · ${me.appearance ? `hoje de ${me.appearance}` : 'roupa do dia não informada'}`}
              </Text>
            ) : null}
            <Text style={ui.h2} accessibilityRole="header" accessibilityLiveRegion="polite">
              {alerts === null ? 'Carregando…' : alerts.length === 0 ? 'Nenhum alerta agora' : countText(alerts.length)}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <AlertCard alert={item} now={now} meId={me?.id ?? null} onPress={() => router.push({ pathname: '/alerts/[id]', params: { id: item.id } })} />
        )}
        ListEmptyComponent={
          alerts ? (
            <Text style={ui.body}>Quando alguém ler um QR code do bar, o alerta aparece aqui e o celular vibra.</Text>
          ) : undefined
        }
        ListFooterComponent={
          showDemo ? (
            <View style={{ marginTop: space.xl, gap: space.xs }}>
              <View style={ui.rule} />
              <Text style={[ui.labelCaps, { marginTop: space.sm }]}>Demonstração</Text>
              <Text style={ui.muted}>Cria um alerta como se alguém tivesse lido o QR code do banheiro feminino.</Text>
              <Button label="Simular um alerta" icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => simulateAlert().catch(() => {})} />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
