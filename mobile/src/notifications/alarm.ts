import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { KIND_STAFF_LABEL, type Alert } from '@nenm/shared';

/**
 * Alarme de alerta novo, no que o Expo Go (SDK 58) deixa fazer:
 * notificação local (o push remoto não existe no Expo Go do Android desde a
 * SDK 53). Pedido do Brian (16/11/2026): "Habilitar notificações no app
 * android e IOS, de preferencia aquelas notificações semelhantes a alarme".
 *
 * - Android: canal de prioridade máxima com o som tocando como ALARME (volume
 *   de alarme, não de notificação), vibração longa, aparece na tela
 *   bloqueada e passa pelo "Não perturbe" se a pessoa permitir.
 * - iOS: som padrão e nível "time sensitive" (o iOS só respeita esse nível
 *   com o direito no app; sem ele, vira uma notificação comum com som). O
 *   "Critical Alert", que toca no silencioso, depende de autorização da Apple
 *   e de build próprio.
 * - Repete como despertador: além da notificação na hora, agenda mais 5 no
 *   próprio sistema (20 s, 40 s, 60 s, 90 s e 120 s). Elas tocam mesmo com o
 *   app em segundo plano, e são canceladas assim que alguém vê o alerta.
 * - Com o app aberto, o celular vibra sem parar enquanto houver alerta que
 *   ninguém viu.
 *
 * A palavra-código não vai na notificação: ela aparece na tela bloqueada, e a
 * palavra é o que prova a ela que a pessoa é da equipe.
 */

/** Canal novo: o Android não deixa mudar som e importância de um canal que já existe. */
export const ALARM_CHANNEL = 'alerts-alarm';
const OLD_CHANNELS = ['alerts'];

export const VIBRATION = [0, 800, 300, 800, 300, 800, 300, 800];
/** Segundos depois do primeiro toque em que o alarme toca de novo, se ninguém tiver visto. */
export const REPEAT_AT = [20, 40, 60, 90, 120];

const scheduled = new Map<string, string[]>();
let vibrating = false;

export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    for (const id of OLD_CHANNELS) await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Alertas (alarme)',
      description: 'Alerta novo de quem pediu ajuda no bar. Toca como alarme até alguém ver.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
      },
      vibrationPattern: VIBRATION,
      enableVibrate: true,
      enableLights: true,
      lightColor: '#FF7EAD',
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  }).catch(() => undefined);
}

function content(alert: Alert, assigned: boolean, repeat: boolean): Notifications.NotificationContentInput {
  const who = alert.assignedByName?.split(' ')[0] ?? 'A gerência';
  const title = assigned ? `${who} pediu que você vá: ${alert.spotLabel}` : `${repeat ? 'Ninguém viu ainda · ' : ''}Alerta · ${alert.spotLabel}`;
  return {
    title,
    body: `${KIND_STAFF_LABEL[alert.kind]}. Toque para atender.`,
    data: { alertId: alert.id },
    sound: 'default',
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive',
    vibrate: VIBRATION,
  };
}

/** Toca o alarme de um alerta: na hora e repetindo até `silence(alert.id)`. */
export async function ring(alert: Alert, assigned = false): Promise<void> {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  const channel = Platform.OS === 'android' ? { channelId: ALARM_CHANNEL } : {};
  const ids: string[] = [];
  scheduled.set(alert.id, ids);
  try {
    ids.push(await Notifications.scheduleNotificationAsync({ content: content(alert, assigned, false), trigger: Platform.OS === 'android' ? { channelId: ALARM_CHANNEL } : null }));
    for (const seconds of REPEAT_AT) {
      // O alerta pode ter sido visto enquanto agendava.
      if (scheduled.get(alert.id) !== ids) break;
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: content(alert, assigned, true),
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, ...channel },
        }),
      );
    }
  } catch {
    // Sem permissão de notificação: a vibração do app aberto continua avisando.
  }
  if (scheduled.get(alert.id) !== ids) await cancel(ids, alert.id);
}

/** Para o alarme de um alerta: cancela as repetições e tira a notificação da bandeja. */
export async function silence(alertId: string): Promise<void> {
  const ids = scheduled.get(alertId);
  scheduled.delete(alertId);
  if (ids) await cancel(ids, alertId);
}

async function cancel(ids: string[], alertId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    shown
      .filter((n) => n.request.content.data?.alertId === alertId)
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
  );
}

/** Com o app aberto: vibra sem parar enquanto houver alerta que ninguém viu. */
export function setContinuousVibration(on: boolean): void {
  if (Platform.OS === 'web' || on === vibrating) return;
  vibrating = on;
  if (on) Vibration.vibrate(VIBRATION, true);
  else Vibration.cancel();
}

/** Botão "Testar o alarme" dos Ajustes: um toque só, sem repetir. */
export async function testAlarm(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
    if (!asked.granted) return false;
  }
  Vibration.vibrate(VIBRATION);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Teste do alarme',
      body: 'É assim que um alerta novo chega.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL } : {}) },
  });
  return true;
}
