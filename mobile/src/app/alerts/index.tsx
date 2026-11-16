import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from '@/components/Button';
import { AlertCard } from '@/components/AlertCard';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useSession } from '@/hooks/useSession';
import { showDemo, simulateAlert } from '@/data/source';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { space, ui } from '@/theme/theme';

/** Pedidos abertos do bar, do mais antigo ao mais novo (quem espera há mais tempo, primeiro). */
export default function Alerts() {
  const { me } = useSession();
  const alerts = useActiveAlerts(!!me);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (me === null) router.replace('/login');
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
        contentContainerStyle={[ui.content, { flexGrow: 1 }]}
        ListHeaderComponent={
          <View style={{ gap: space.xxs }}>
            <ConnectionBanner />
            <Text style={ui.muted} accessibilityRole="text">
              {me ? `${me.fullName.split(' ')[0]} · ${me.appearance ? `hoje de ${me.appearance}` : 'roupa do dia não informada'}` : ''}
            </Text>
            <Text style={ui.h2} accessibilityRole="header" accessibilityLiveRegion="polite">
              {alerts === null ? 'Carregando…' : alerts.length === 0 ? 'Nenhum pedido agora' : `${alerts.length} pedido(s) em aberto`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <AlertCard alert={item} now={now} onPress={() => router.push({ pathname: '/alerts/[id]', params: { id: item.id } })} />
        )}
        ListEmptyComponent={
          alerts ? (
            <Text style={ui.body}>Quando alguém ler um QR code do bar, o pedido aparece aqui e o celular vibra.</Text>
          ) : undefined
        }
        ListFooterComponent={
          showDemo ? (
            <View style={[ui.card, { marginTop: space.lg }]}>
              <Text style={ui.label}>Demonstração</Text>
              <Text style={ui.muted}>Cria um pedido como se alguém tivesse lido o QR code do banheiro feminino.</Text>
              <Button label="Simular um pedido" onPress={() => simulateAlert().catch(() => {})} />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
