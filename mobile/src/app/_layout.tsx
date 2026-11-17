import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MotionProvider } from '@/hooks/useMotion';
import { SessionProvider } from '@/hooks/useSession';
import { setupNotifications } from '@/hooks/useActiveAlerts';
import { setPendingAlert } from '@/notifications/openAlert';
import { color, font, fontSize } from '@/theme/theme';

// A tela de abertura fica até as fontes carregarem (ou falharem).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Teto de espera pelas fontes: é um alarme, não pode travar na abertura. */
const FONT_TIMEOUT_MS = 3000;

export default function RootLayout() {
  // Os nomes aqui são os de `font` em theme.ts. Se falhar, segue com a do sistema.
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });
  const [timedOut, setTimedOut] = useState(false);
  const ready = fontsLoaded || !!fontError || timedOut;
  // O Stack já está montado (o toque com o app aberto pode navegar na hora).
  const mounted = useRef(false);
  useEffect(() => {
    if (ready) mounted.current = true;
  }, [ready]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    setupNotifications().catch(() => {});
    if (Platform.OS === 'web') return;
    // Tocar na notificação abre o alerta direto. A mesma resposta pode chegar
    // pelo listener e pela última guardada: abre uma vez só.
    let handled: string | null = null;
    const open = (res: Notifications.NotificationResponse) => {
      const key = `${res.notification.request.identifier}:${res.actionIdentifier}`;
      if (key === handled) return;
      handled = key;
      try {
        Notifications.clearLastNotificationResponse();
      } catch {}
      const id = res.notification.request.content.data?.alertId;
      if (typeof id !== 'string') return;
      // Antes de o app estar pronto, a navegação se perderia: a lista de alertas abre depois.
      if (mounted.current) router.push(`/alerts/${id}`);
      else setPendingAlert(id);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    // App fechado: o toque chega antes do listener e fica só como a última resposta.
    // Vira pendente: a lista de alertas o abre quando montar.
    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) open(last);
    } catch {}
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <MotionProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.bg },
              headerTintColor: color.text,
              headerTitleStyle: { fontFamily: font.display, fontSize: fontSize.lg },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: color.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Entrar', headerShown: false }} />
            <Stack.Screen name="alerts/index" options={{ title: 'Alertas', headerBackVisible: false }} />
            <Stack.Screen name="alerts/[id]" options={{ title: 'Alerta' }} />
            <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
            <Stack.Screen name="menu" options={{ title: 'Cardápio do bar' }} />
          </Stack>
        </SessionProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}
