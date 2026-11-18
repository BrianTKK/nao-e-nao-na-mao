import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Share, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { CardTitle } from '@/components/CardTitle';
import { FocusInput } from '@/components/FocusInput';
import { useMotion } from '@/hooks/useMotion';
import { useSession } from '@/hooks/useSession';
import { dataSource } from '@/data/source';
import { WIFI_LIMITS, pendingFor } from '@nenm/shared';
import { Icon } from '@/components/Icon';
import { useOutbox } from '@/hooks/useOutbox';
import { testAlarm } from '@/notifications/alarm';
import { ownAndroidBuild, pushStatus, registerPush } from '@/notifications/push';
import { color, space, ui } from '@/theme/theme';

export default function Settings() {
  const { me, signOut, refresh } = useSession();
  const { appReduceMotion, setAppReduceMotion, systemReduceMotion } = useMotion();
  const [appearance, setAppearance] = useState(me?.appearance ?? '');
  const [saved, setSaved] = useState(false);
  const [alarm, setAlarm] = useState<'idle' | 'sent' | 'denied'>('idle');
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiStatus, setWifiStatus] = useState<string | null>(null);
  const [push, setPush] = useState(pushStatus);
  // Toques guardados sem sinal: quem sai agora só os envia quando entrar de novo neste celular.
  const queued = pendingFor(useOutbox(), me?.id).filter((a) => a.kind !== 'ack').length;
  // O registro do push roda ao entrar e pode terminar depois de esta tela abrir.
  useEffect(() => {
    if (!ownAndroidBuild) return;
    const id = setTimeout(() => setPush(pushStatus()), 1500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (me?.role !== 'manager') return;
    dataSource.manager
      .getWifi()
      .then((w) => {
        setSsid(w?.ssid ?? '');
        setWifiPassword(w?.password ?? '');
      })
      .catch(() => {});
  }, [me?.role]);

  const saveWifi = async () => {
    try {
      const w = await dataSource.manager.setWifi(ssid.trim() ? { ssid: ssid.trim(), password: wifiPassword || null } : null);
      setWifiStatus(w ? 'Wi-Fi salvo.' : 'Wi-Fi removido.');
    } catch {
      setWifiStatus('Não foi possível salvar o Wi-Fi.');
    }
  };

  const save = async () => {
    await dataSource.staff.setMyAppearance(appearance);
    await refresh();
    setSaved(true);
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={ui.card}>
        <CardTitle icon="user">Como você está vestido hoje?</CardTitle>
        <Text style={ui.muted}>Aparece para quem pediu ajuda: "Diego, de camisa preta, está indo até você".</Text>
        <FocusInput
          value={appearance}
          onChangeText={(t) => {
            setAppearance(t);
            setSaved(false);
          }}
          maxLength={60}
          placeholder="Ex.: camisa preta"
          accessibilityLabel="Roupa de hoje"
        />
        <Button label={saved ? 'Salvo' : 'Salvar'} variant="calm" icon={saved ? 'check' : undefined} onPress={save} />
      </View>

      <View style={[ui.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={ui.label} nativeID="motion-label">
            Reduzir movimento
          </Text>
          <Text style={ui.muted}>
            Tira as animações e o pulso dos alertas novos (a vibração continua).
            {systemReduceMotion ? ' O celular já pede menos movimento.' : ''}
          </Text>
        </View>
        <Switch
          value={appReduceMotion || systemReduceMotion}
          disabled={systemReduceMotion}
          onValueChange={setAppReduceMotion}
          accessibilityLabelledBy="motion-label"
          accessibilityLabel="Reduzir movimento"
          trackColor={{ true: color.accent, false: color.borderStrong }}
          thumbColor={color.text}
        />
      </View>

      <View style={ui.card}>
        <CardTitle icon="bell">Alarme de alerta novo</CardTitle>
        <Text style={ui.muted}>
          Alerta novo toca como alarme e repete por 2 minutos até alguém ver. Com o app aberto, o celular vibra sem parar.
          {Platform.OS === 'android'
            ? ` Para tocar com o celular no "Não perturbe", permita isso no canal "Alertas (alarme)" das notificações ${ownAndroidBuild ? 'do app' : 'do Expo Go'}.`
            : ' No iPhone, o modo silencioso corta o som (a vibração continua).'}
        </Text>
        <Text style={ui.muted}>
          {ownAndroidBuild && push.registered
            ? 'Com o app fechado, o alarme chega pelo push. Se o celular economiza bateria, deixe o app fora da otimização de bateria.'
            : 'Com o app fechado, o alarme não chega: deixe o app aberto ou em segundo plano durante o turno.'}
        </Text>
        <Button
          label={alarm === 'sent' ? 'Toca em 5 segundos: bloqueie a tela' : 'Testar o alarme'}
          variant="secondary"
          icon="bell"
          onPress={async () => setAlarm((await testAlarm().catch(() => false)) ? 'sent' : 'denied')}
        />
        {alarm === 'denied' && (
          <>
            <Text style={ui.body} accessibilityLiveRegion="polite">
              As notificações estão bloqueadas para {ownAndroidBuild ? 'o app' : 'o Expo Go'}.
            </Text>
            <Button label="Abrir as configurações" variant="secondary" icon="settings" onPress={() => Linking.openSettings()} />
          </>
        )}
      </View>

      {me?.role === 'manager' && (
        <View style={ui.card}>
          <CardTitle icon="menu-book">Cardápio do bar</CardTitle>
          <Text style={ui.muted}>Fotografe o cardápio de papel ou cole o link do cardápio digital. Aparece no "Ver cardápio" da página de ajuda.</Text>
          <Button label="Cadastrar o cardápio" variant="secondary" icon="menu-book" onPress={() => router.push('/menu')} />
        </View>
      )}

      {me?.role === 'manager' && (
        <View style={ui.card}>
          <CardTitle icon="wifi">Wi-Fi do local</CardTitle>
          <Text style={ui.muted}>
            Opcional. Aparece no botão "Wi-Fi do local" da página de ajuda, só para quem abriu um QR code deste bar. Use a rede dos clientes.
          </Text>
          <FocusInput
            value={ssid}
            onChangeText={(v) => {
              setSsid(v);
              setWifiStatus(null);
            }}
            maxLength={WIFI_LIMITS.maxSsid}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Nome da rede"
            accessibilityLabel="Nome da rede"
          />
          <FocusInput
            value={wifiPassword}
            onChangeText={(v) => {
              setWifiPassword(v);
              setWifiStatus(null);
            }}
            maxLength={WIFI_LIMITS.maxPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Senha (em branco para rede aberta)"
            accessibilityLabel="Senha do Wi-Fi, em branco para rede aberta"
          />
          <Button label="Salvar Wi-Fi" variant="calm" icon="wifi" onPress={saveWifi} />
          {wifiStatus && (
            <Text style={ui.body} accessibilityLiveRegion="polite">
              {wifiStatus}
            </Text>
          )}
        </View>
      )}

      {me?.role === 'manager' && ownAndroidBuild && (
        <View style={ui.card}>
          <CardTitle icon="info">Teste do push</CardTitle>
          <Text style={ui.muted}>
            {push.registered ? 'Push ativo neste aparelho.' : push.problem ?? 'Push ainda não registrado neste aparelho.'} O token abaixo serve para mandar um
            alarme de teste direto pelo Firebase, com o app fechado.
          </Text>
          {push.deviceToken && (
            <Text style={ui.body} selectable accessibilityLabel="Token do aparelho">
              {push.deviceToken}
            </Text>
          )}
          {push.deviceToken && <Button label="Compartilhar o token" variant="secondary" icon="copy" onPress={() => Share.share({ message: push.deviceToken! }).catch(() => {})} />}
          <Button
            label="Registrar de novo"
            variant="secondary"
            onPress={async () => {
              await registerPush().catch(() => false);
              setPush(pushStatus());
            }}
          />
        </View>
      )}

      {queued > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xs }} accessible accessibilityRole="text">
          <Icon name="wifi-off" size={20} color={color.alert} />
          <Text style={[ui.body, { flex: 1 }]}>
            {queued === 1 ? 'Há 1 toque seu guardado sem sinal.' : `Há ${queued} toques seus guardados sem sinal.`} Se você sair agora, ele só é enviado
            quando você entrar de novo neste celular, em até 12 horas.
          </Text>
        </View>
      )}

      <Button
        label="Sair"
        variant="secondary"
        icon="log-out"
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      />
    </ScrollView>
  );
}
