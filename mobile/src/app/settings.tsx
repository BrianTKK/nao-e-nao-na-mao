import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { useMotion } from '@/hooks/useMotion';
import { useSession } from '@/hooks/useSession';
import { dataSource } from '@/data/source';
import { color, space, ui } from '@/theme/theme';

export default function Settings() {
  const { me, signOut, refresh } = useSession();
  const { appReduceMotion, setAppReduceMotion, systemReduceMotion } = useMotion();
  const [appearance, setAppearance] = useState(me?.appearance ?? '');
  const [saved, setSaved] = useState(false);

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
