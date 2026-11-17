import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import { dataSource } from '@/data/source';

/**
 * Push remoto do alarme (FCM), só no app próprio do Android (APK), nunca no
 * Expo Go, que não tem push no Android desde a SDK 53. Ver docs/NOTIFICACOES.md.
 *
 * - Ao entrar (e a cada abertura com login), o app pega o token do Firebase
 *   deste aparelho e registra no servidor para quem entrou.
 * - Ao sair, remove o token antes de apagar o login.
 * - Se o Firebase não estiver no build (APK sem google-services.json), o token
 *   não sai: o push fica desligado e o alarme continua pelo toque local.
 */

let token: string | null = null;
/** Token do aparelho, mesmo que o servidor ainda não o tenha aceitado (teste do push antes do deploy). */
let deviceToken: string | null = null;
/** Por que o push não está ativo (para os Ajustes), ou null. */
let problem: string | null = null;
let listener: Notifications.EventSubscription | null = null;

/** O push está registrado neste aparelho (o servidor é quem repete o alarme). */
export const pushActive = () => token !== null;

/** App próprio do Android (APK), o único com push. */
export const ownAndroidBuild = Platform.OS === 'android' && !isRunningInExpoGo();
const supported = () => ownAndroidBuild;

/** Para o teste do push nos Ajustes (só a gerência vê): o token deste aparelho ou o motivo de não haver. */
export const pushStatus = () => ({ deviceToken, registered: token !== null, problem });

async function send(next: string): Promise<void> {
  await dataSource.staff.registerPushToken(next, 'android');
  token = next;
}

/** Registra o token deste aparelho. Devolve se o push ficou ativo. */
export async function registerPush(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted && !(await Notifications.requestPermissionsAsync()).granted) {
      problem = 'As notificações estão bloqueadas para o app.';
      return false;
    }
    const device = await Notifications.getDevicePushTokenAsync();
    if (device.type !== 'android' || typeof device.data !== 'string') {
      problem = 'O aparelho não devolveu o token do Firebase.';
      return false;
    }
    deviceToken = device.data;
    await send(device.data);
    problem = null;
    // O Firebase pode trocar o token (reinstalação, dados apagados): registrar o novo.
    listener ??= Notifications.addPushTokenListener((t) => {
      if (t.type === 'android' && typeof t.data === 'string' && t.data !== token) send(t.data).catch(() => {});
    });
    return true;
  } catch (err) {
    // Sem o Firebase no build ("Default FirebaseApp is not initialized") ou sem rede.
    console.warn('Push remoto desligado:', (err as Error).message);
    token = null;
    problem = /Firebase/i.test((err as Error).message)
      ? 'Este APK foi gerado sem o Firebase (sem o google-services.json).'
      : 'Não deu para registrar o push (sem rede ou o servidor recusou).';
    return false;
  }
}

/** Ao sair: tira o token do servidor (melhor esforço; o login some de qualquer jeito). */
export async function unregisterPush(): Promise<void> {
  listener?.remove();
  listener = null;
  const t = token;
  token = null;
  if (t) await dataSource.staff.removePushToken(t).catch(() => {});
}
