import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEMO_PASSWORD, DataError } from '@nenm/shared';
import { Button } from '@/components/Button';
import { FocusInput } from '@/components/FocusInput';
import { Logo } from '@/components/Logo';
import { useSession } from '@/hooks/useSession';
import { showDemo } from '@/data/source';
import { space, ui } from '@/theme/theme';

export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/alerts');
    } catch (err) {
      setError(
        err instanceof DataError && err.code === 'invalid_credentials'
          ? 'E-mail ou senha incorretos.'
          : err instanceof DataError && err.code === 'network'
            ? 'Sem conexão com o servidor. Confira a internet e tente de novo.'
            : err instanceof DataError && err.code === 'rate_limited'
              ? 'Muitas tentativas. Espere alguns minutos.'
              : 'Não foi possível entrar. Tente de novo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[ui.content, { paddingTop: space.xxl }]} keyboardShouldPersistTaps="handled">
          <Logo size={40} style={{ alignSelf: 'flex-start', marginLeft: -space.xxs }} />
          <Text style={ui.h1} accessibilityRole="header">
            App da equipe
          </Text>
          <Text style={ui.body}>Receba os alertas do bar e diga a quem pediu que você está indo.</Text>

          <View style={{ gap: space.xxs }}>
            <Text style={ui.label} nativeID="email-label">
              E-mail
            </Text>
            <FocusInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabelledBy="email-label"
              accessibilityLabel="E-mail"
            />
          </View>
          <View style={{ gap: space.xxs }}>
            <Text style={ui.label} nativeID="password-label">
              Senha
            </Text>
            <FocusInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              accessibilityLabelledBy="password-label"
              accessibilityLabel="Senha"
              onSubmitEditing={submit}
            />
          </View>
          {error && (
            <Text style={ui.error} accessibilityLiveRegion="assertive" accessibilityRole="alert">
              {error}
            </Text>
          )}
          <Button label="Entrar" variant="primary" large icon="arrow-right" busy={busy} onPress={submit} />

          {showDemo && (
            <View style={[ui.card, { marginTop: space.lg }]}>
              <Text style={ui.label}>Demonstração (bar fictício)</Text>
              <Button
                label="Preencher com a conta de teste do Diego"
                variant="secondary"
                icon="user"
                onPress={() => {
                  setEmail('diego@bar-esquina.test');
                  setPassword(DEMO_PASSWORD);
                }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
