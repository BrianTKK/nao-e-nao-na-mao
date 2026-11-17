import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MotionProvider } from '@/hooks/useMotion';
import { SessionProvider } from '@/hooks/useSession';
import { setupNotifications } from '@/hooks/useActiveAlerts';
import { color, fontSize } from '@/theme/theme';

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(() => {});
    if (Platform.OS === 'web') return;
    // Tocar na notificação abre o alerta direto.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const id = res.notification.request.content.data?.alertId;
      if (typeof id === 'string') router.push(`/alerts/${id}`);
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <MotionProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.bg },
              headerTintColor: color.text,
              headerTitleStyle: { fontSize: fontSize.md, fontWeight: '700' },
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
