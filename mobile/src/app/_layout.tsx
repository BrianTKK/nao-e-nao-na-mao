import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MotionProvider } from '@/hooks/useMotion';
import { SessionProvider } from '@/hooks/useSession';
import { setupNotifications } from '@/hooks/useActiveAlerts';
import { color, fontSize } from '@/theme/theme';

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(() => {});
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
            <Stack.Screen name="alerts/index" options={{ title: 'Pedidos de ajuda', headerBackVisible: false }} />
            <Stack.Screen name="alerts/[id]" options={{ title: 'Pedido' }} />
            <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
          </Stack>
        </SessionProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}
