import { useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { KIND_STAFF_LABEL, displayCode, type Alert } from '@nenm/shared';
import { dataSource } from '@/data/source';

// O bar é barulhento: o pedido chega por vibração forte e texto, não por som.
const VIBRATION = [0, 500, 200, 500, 200, 500];

/**
 * Pedidos abertos do bar, ao vivo. Quando chega um pedido novo, o celular
 * vibra e mostra uma notificação local (com o app aberto ou em segundo plano
 * recente). O push remoto, que acorda o celular com o app fechado, precisa de
 * um development build: no Expo Go do Android ele não existe desde a SDK 53.
 */
export function useActiveAlerts(meId: string | null): Alert[] | null {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const known = useRef<Set<string> | null>(null);
  const assignedToMe = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!meId) return;
    return dataSource.staff.watchActiveAlerts((list) => {
      setAlerts(list);
      const fresh = known.current ? list.filter((a) => a.status === 'open' && !known.current!.has(a.id)) : [];
      known.current = new Set(list.map((a) => a.id));
      // A gerência direcionou um pedido para mim: avisa de novo, mesmo que eu já tenha visto.
      const mine = list.filter((a) => a.assignedToId === meId && !a.responderId && !assignedToMe.current.has(a.id));
      mine.forEach((a) => assignedToMe.current.add(a.id));
      if (mine.length > 0) announce(mine[mine.length - 1], true);
      else if (fresh.length > 0) announce(fresh[fresh.length - 1]);
    });
  }, [meId]);

  return alerts;
}

function announce(alert: Alert, assigned = false) {
  if (Platform.OS === 'web') return;
  Vibration.vibrate(VIBRATION);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  Notifications.scheduleNotificationAsync({
    content: {
      title: assigned
        ? `${alert.assignedByName?.split(' ')[0] ?? 'A gerência'} pediu que você vá: ${alert.spotLabel}`
        : `Pedido de ajuda · ${alert.spotLabel}`,
      body: `${KIND_STAFF_LABEL[alert.kind]}. Palavra ${displayCode(alert.shortCode)}.`,
      data: { alertId: alert.id },
    },
    trigger: null,
  }).catch(() => {});
}

export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Pedidos de ajuda',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: VIBRATION,
      enableVibrate: true,
    });
  }
  await Notifications.requestPermissionsAsync().catch(() => undefined);
}
