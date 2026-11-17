import { Platform, Vibration } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { ALARM_CHANNEL as OWN_CHANNEL, ALARM_CHANNEL_EXPO_GO, ALARM_REPEAT_AT_S, ALARM_SOUND, ALARM_VIBRATION, KIND_STAFF_LABEL, type Alert } from '@nenm/shared';
import { pushActive } from './push';

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
 *
 * No app próprio (APK, desde 17/11/2026), duas diferenças:
 * - o canal é outro (`alerts-alarm-v2`), com o som da Mariana;
 * - com o push remoto ativo, quem repete é o servidor (server/src/push.ts),
 *   e o app só toca o primeiro aviso local. O aviso local usa o id do alerta
 *   como identificador, o mesmo `tag` do push: um substitui o outro, sem
 *   aviso em dobro. Com o app aberto, o push (só de dados) não aparece.
 */

/** Expo Go não tem o som próprio (nem o push): fica no canal de som padrão. */
const OWN_BUILD = Platform.OS !== 'web' && !isRunningInExpoGo();
/** Canal do alarme. O Android não deixa mudar som e importância de um canal que já existe. */
export const ALARM_CHANNEL = OWN_BUILD ? OWN_CHANNEL : ALARM_CHANNEL_EXPO_GO;
const SOUND = OWN_BUILD ? ALARM_SOUND : 'default';
const OLD_CHANNELS = OWN_BUILD ? ['alerts', ALARM_CHANNEL_EXPO_GO] : ['alerts'];

export const VIBRATION = ALARM_VIBRATION;
/** Segundos depois do primeiro toque em que o alarme toca de novo, se ninguém tiver visto. */
export const REPEAT_AT = ALARM_REPEAT_AT_S;

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
      sound: SOUND,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
      },
      vibrationPattern: VIBRATION,
      enableVibrate: true,
      enableLights: true,
      lightColor: '#FFB840',
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
    sound: SOUND,
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
    ids.push(
      await Notifications.scheduleNotificationAsync({
        // Mesmo identificador do push do servidor (tag = id do alerta): um substitui o outro.
        identifier: alert.id,
        content: content(alert, assigned, false),
        trigger: Platform.OS === 'android' ? { channelId: ALARM_CHANNEL } : null,
      }),
    );
    // Com o push ativo, o servidor repete (e acorda o celular com o app fechado).
    for (const seconds of pushActive() ? [] : REPEAT_AT) {
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
  await dismissWhere((id) => id === alertId);
}

/** Tira da bandeja os avisos (locais ou do push) cujo alerta satisfaz `match`. */
async function dismissWhere(match: (alertId: string) => boolean): Promise<void> {
  const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    shown
      .filter((n) => {
        const id = n.request.content.data?.alertId;
        return typeof id === 'string' && match(id);
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
  );
}

/**
 * Ao abrir o app: tira da bandeja os avisos de alertas que já não tocam (alguém
 * viu enquanto o celular estava fechado; o push do servidor não apaga sozinho).
 */
export async function dismissStale(ringing: ReadonlySet<string>): Promise<void> {
  if (Platform.OS === 'web') return;
  await dismissWhere((id) => !ringing.has(id));
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
      sound: SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, ...(Platform.OS === 'android' ? { channelId: ALARM_CHANNEL } : {}) },
  });
  return true;
}
