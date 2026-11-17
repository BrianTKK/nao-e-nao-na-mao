import { useState } from 'react';
import { Linking, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { useMotion } from '@/hooks/useMotion';
import { useSession } from '@/hooks/useSession';
import { dataSource } from '@/data/source';
import { testAlarm } from '@/notifications/alarm';
import { color, space, ui } from '@/theme/theme';

export default function Settings() {
  const { me, signOut, refresh } = useSession();
  const { appReduceMotion, setAppReduceMotion, systemReduceMotion } = useMotion();
  const [appearance, setAppearance] = useState(me?.appearance ?? '');
  const [saved, setSaved] = useState(false);
  const [alarm, setAlarm] = useState<'idle' | 'sent' | 'denied'>('idle');

  const save = async () => {
    await dataSource.staff.setMyAppearance(appearance);
    await refresh();
    setSaved(true);
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={ui.card}>
        <Text style={ui.h2} accessibilityRole="header">
          Como você está vestido hoje?
        </Text>
        <Text style={ui.muted}>Aparece para quem pediu ajuda: "Diego, de camisa preta, está indo até você".</Text>
        <TextInput
          style={ui.input}
          value={appearance}
          onChangeText={(t) => {
            setAppearance(t);
            setSaved(false);
          }}
          maxLength={60}
          placeholder="Ex.: camisa preta"
          placeholderTextColor={color.textMuted}
          accessibilityLabel="Roupa de hoje"
        />
        <Button label={saved ? 'Salvo' : 'Salvar'} variant="primary" onPress={save} />
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
        <Text style={ui.h2} accessibilityRole="header">
          Alarme de alerta novo
        </Text>
        <Text style={ui.muted}>
          Alerta novo toca como alarme e repete por 2 minutos até alguém ver. Com o app aberto, o celular vibra sem parar.
          {Platform.OS === 'android'
            ? ' Para tocar com o celular no "Não perturbe", permita isso no canal "Alertas (alarme)" das notificações do Expo Go.'
            : ' No iPhone, o modo silencioso corta o som (a vibração continua).'}
        </Text>
        <Text style={ui.muted}>Com o app fechado, o alarme não chega: deixe o app aberto ou em segundo plano durante o turno.</Text>
        <Button
          label={alarm === 'sent' ? 'Toca em 5 segundos: bloqueie a tela' : 'Testar o alarme'}
          variant="primary"
          onPress={async () => setAlarm((await testAlarm().catch(() => false)) ? 'sent' : 'denied')}
        />
        {alarm === 'denied' && (
          <>
            <Text style={ui.body} accessibilityLiveRegion="polite">
              As notificações estão bloqueadas para o Expo Go.
            </Text>
            <Button label="Abrir as configurações" onPress={() => Linking.openSettings()} />
          </>
        )}
      </View>

      <Button
        label="Sair"
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      />
    </ScrollView>
  );
}
